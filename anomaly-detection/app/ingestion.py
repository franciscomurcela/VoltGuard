import asyncio
import os
import uuid
import io
import zipfile
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

from app.schemas import DatasetAnalysisConfig
from app.pipeline import _analyze_measurement_with_prophet, _parse_csv_points
from app.state import save_dataset

logger = logging.getLogger("voltguard-api")


class PeriodicIngestionService:
    def __init__(self) -> None:
        self.config: Dict[str, Any] = {
            "enabled": os.getenv("VG_PERIODIC_INGESTION_ENABLED", "0") == "1",
            "interval_seconds": int(os.getenv("VG_INGESTION_INTERVAL_SECONDS", "300")),
            "ingestion_mode": os.getenv("VG_INGESTION_MODE", "datasets").strip().lower(),
            "composer_base_url": os.getenv("VG_COMPOSER_BASE_URL", "").strip(),
            "sensors_path": os.getenv("VG_COMPOSER_SENSORS_PATH", "/v1/sensors").strip(),
            "measurements_path_template": os.getenv(
                "VG_COMPOSER_MEASUREMENTS_PATH_TEMPLATE",
                "/v1/sensors/{sensor_id}/measurements?limit={limit}",
            ).strip(),
            "composer_token": os.getenv("VG_COMPOSER_TOKEN", "").strip(),
            "measurements_limit": int(os.getenv("VG_COMPOSER_MEASUREMENTS_LIMIT", "500")),
            "default_metric_name": os.getenv("VG_DEFAULT_METRIC_NAME", "voltage").strip(),
        }

        self.runtime: Dict[str, Any] = {
            "running": False,
            "last_run_at": None,
            "last_success_at": None,
            "last_error": None,
            "runs_total": 0,
            "runs_failed": 0,
            "last_processed_sensors": 0,
            "last_ingested_measurements": 0,
        }

        self._last_sensor_timestamp: Dict[str, str] = {}
        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    def _dataset_sources(self) -> List[Dict[str, Any]]:
        dataset_1 = {
            "name": "uci_household_power_consumption",
            "url": os.getenv(
                "VG_DATASET_1_URL",
                "https://archive.ics.uci.edu/static/public/235/individual+household+electric+power+consumption.zip",
            ).strip(),
            "source_id": os.getenv("VG_DATASET_1_SOURCE_ID", "sensor_periodic_uci_household").strip(),
            "metric_name": os.getenv("VG_DATASET_1_METRIC_NAME", "global_active_power").strip(),
            "timestamp_column": os.getenv("VG_DATASET_1_TIMESTAMP_COLUMN", "").strip() or None,
            "timestamp_format": os.getenv("VG_DATASET_1_TIMESTAMP_FORMAT", "%d/%m/%Y %H:%M:%S").strip() or None,
            "date_column": os.getenv("VG_DATASET_1_DATE_COLUMN", "Date").strip() or None,
            "time_column": os.getenv("VG_DATASET_1_TIME_COLUMN", "Time").strip() or None,
            "value_column": os.getenv("VG_DATASET_1_VALUE_COLUMN", "Global_active_power").strip(),
            "delimiter": os.getenv("VG_DATASET_1_DELIMITER", "").strip() or None,
            "temporal_mode": os.getenv("VG_DATASET_1_TEMPORAL_MODE", "daily").strip(),
            "aggregation": os.getenv("VG_DATASET_1_AGGREGATION", "mean").strip(),
            "max_rows": int(os.getenv("VG_DATASET_1_MAX_ROWS", "1000")),
        }

        dataset_2 = {
            "name": "opsd_germany_daily",
            "url": os.getenv("VG_DATASET_2_URL", "https://raw.githubusercontent.com/jenfly/opsd/master/opsd_germany_daily.csv").strip(),
            "source_id": os.getenv("VG_DATASET_2_SOURCE_ID", "sensor_periodic_opsd").strip(),
            "metric_name": os.getenv("VG_DATASET_2_METRIC_NAME", "consumption").strip(),
            "timestamp_column": os.getenv("VG_DATASET_2_TIMESTAMP_COLUMN", "Date").strip(),
            "value_column": os.getenv("VG_DATASET_2_VALUE_COLUMN", "Consumption").strip(),
            "delimiter": os.getenv("VG_DATASET_2_DELIMITER", "").strip() or None,
            "temporal_mode": os.getenv("VG_DATASET_2_TEMPORAL_MODE", "daily").strip(),
            "aggregation": os.getenv("VG_DATASET_2_AGGREGATION", "mean").strip(),
            "max_rows": int(os.getenv("VG_DATASET_2_MAX_ROWS", "0")),
        }

        return [dataset_1, dataset_2]

    @staticmethod
    def _read_dataset_text(url: str, response: httpx.Response) -> str:
        content_type = (response.headers.get("content-type") or "").lower()
        is_zip = url.lower().endswith(".zip") or "zip" in content_type

        if not is_zip:
            return response.text

        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            file_candidates = [name for name in archive.namelist() if name.lower().endswith((".csv", ".txt"))]
            if not file_candidates:
                raise ValueError("ZIP sem ficheiros CSV/TXT compatíveis")

            file_name = file_candidates[0]
            with archive.open(file_name) as file_handle:
                return file_handle.read().decode("utf-8", errors="replace")

    @staticmethod
    def _apply_row_limit(csv_text: str, max_rows: int) -> str:
        if not max_rows or max_rows <= 0:
            return csv_text

        lines = csv_text.splitlines()
        if len(lines) <= 1:
            return csv_text

        header = lines[0]
        limited = lines[1 : max_rows + 1]
        return "\n".join([header, *limited])

    def _headers(self) -> Dict[str, str]:
        token = self.config.get("composer_token", "")
        if not token:
            return {}
        return {
            "Authorization": f"Bearer {token}",
            "X-App-Token": token,
        }

    @staticmethod
    def _extract_list(payload: Any, keys: List[str]) -> List[Any]:
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            for key in keys:
                value = payload.get(key)
                if isinstance(value, list):
                    return value
        return []

    @staticmethod
    def _extract_sensor_id(sensor: Dict[str, Any]) -> Optional[str]:
        for key in ["sensor_id", "id", "source_id", "device_id"]:
            value = sensor.get(key)
            if value:
                return str(value)
        return None

    @staticmethod
    def _extract_metric_name(sensor: Dict[str, Any], default_name: str) -> str:
        for key in ["metric_name", "metric", "measurement_type"]:
            value = sensor.get(key)
            if value:
                return str(value)
        return default_name

    @staticmethod
    def _extract_points(payload: Any) -> List[Dict[str, Any]]:
        raw_items = PeriodicIngestionService._extract_list(payload, ["items", "measurements", "data", "values"])
        points: List[Dict[str, Any]] = []

        for item in raw_items:
            if not isinstance(item, dict):
                continue

            timestamp = None
            for ts_key in ["timestamp", "ts", "datetime", "date"]:
                if item.get(ts_key):
                    timestamp = str(item.get(ts_key))
                    break

            if not timestamp:
                continue

            value = None
            for val_key in ["value", "reading", "measurement", "metric_value"]:
                if item.get(val_key) is not None:
                    value = item.get(val_key)
                    break

            if value is None:
                metrics = item.get("metrics")
                if isinstance(metrics, dict):
                    numeric_candidates = [v for v in metrics.values() if isinstance(v, (int, float))]
                    if numeric_candidates:
                        value = numeric_candidates[0]

            if value is None:
                continue

            try:
                points.append({"timestamp": timestamp, "value": float(value)})
            except Exception:
                continue

        points.sort(key=lambda p: p["timestamp"])
        return points

    async def _ingest_sensor(
        self,
        source_id: str,
        metric_name: str,
        points: List[Dict[str, Any]],
        temporal_mode: str,
        aggregation: str,
        context: Dict[str, Any],
    ) -> int:
        measurement_id = f"meas_{uuid.uuid4().hex[:8]}"
        total = len(points)
        config = DatasetAnalysisConfig(
            temporal_mode=temporal_mode,
            aggregation=aggregation,
            timezone="UTC",
            context=context,
        )
        split_idx = int(total * config.train_ratio)

        meta = {
            "measurement_id": measurement_id,
            "source_id": source_id,
            "metric_name": metric_name,
            "rows": total,
            "rows_training": split_idx,
            "rows_forecast": total - split_idx,
            "period_start": points[0]["timestamp"],
            "period_end": points[-1]["timestamp"],
            "config": config.dict(),
            "training_status": "queued",
            "last_trained": None,
            "uploaded_at": datetime.utcnow().isoformat(),
            "ingested_by": "periodic_scheduler",
        }

        save_dataset(measurement_id, meta)

        anomalies_detected = await _analyze_measurement_with_prophet(
            measurement_id=measurement_id,
            source_id=source_id,
            metric_name=metric_name,
            points=points,
            config=config,
        )

        logger.info(
            "⏱️ Ingestão periódica concluída: sensor=%s metric=%s rows=%s anomalias=%s",
            source_id,
            metric_name,
            total,
            anomalies_detected,
        )
        return 1

    async def _run_datasets_mode(self) -> Dict[str, Any]:
        sources = self._dataset_sources()
        processed_sensors = 0
        ingested = 0

        async with httpx.AsyncClient(timeout=30.0) as client:
            for source in sources:
                url = source.get("url", "")
                if not url:
                    continue

                processed_sensors += 1
                response = await client.get(url)
                response.raise_for_status()
                csv_text = self._read_dataset_text(url, response)
                max_rows = int(source.get("max_rows", 0) or 0)
                if max_rows > 0:
                    csv_text = self._apply_row_limit(csv_text, max_rows)
                    logger.info("⏱️ Dataset %s limitado a %s linhas para ingestão", source.get("name"), max_rows)

                points = _parse_csv_points(
                    csv_text,
                    delimiter=source.get("delimiter"),
                    timestamp_column=source.get("timestamp_column"),
                    value_column=source.get("value_column"),
                    date_column=source.get("date_column"),
                    time_column=source.get("time_column"),
                    timestamp_format=source.get("timestamp_format"),
                )

                if len(points) < 6:
                    continue

                source_id = source.get("source_id")
                last_ts = points[-1]["timestamp"]
                prev_ts = self._last_sensor_timestamp.get(source_id)
                if prev_ts is not None and last_ts <= prev_ts:
                    continue

                ingested += await self._ingest_sensor(
                    source_id=source_id,
                    metric_name=source.get("metric_name"),
                    points=points,
                    temporal_mode=source.get("temporal_mode", "daily"),
                    aggregation=source.get("aggregation", "mean"),
                    context={
                        "ingestion_mode": "periodic_datasets",
                        "dataset_name": source.get("name"),
                        "dataset_url": url,
                    },
                )
                self._last_sensor_timestamp[source_id] = last_ts

        return {
            "ok": True,
            "message": "ingestão periódica por datasets executada",
            "processed_sensors": processed_sensors,
            "ingested": ingested,
        }

    async def _run_composer_mode(self) -> Dict[str, Any]:
        base_url = self.config.get("composer_base_url", "").strip()
        sensors_path = self.config.get("sensors_path", "").strip()
        measurements_template = self.config.get("measurements_path_template", "").strip()
        limit = int(self.config.get("measurements_limit", 500))
        default_metric = self.config.get("default_metric_name", "voltage")

        if not base_url:
            message = "VG_COMPOSER_BASE_URL não configurado"
            return {"ok": False, "message": message, "processed_sensors": 0, "ingested": 0}

        processed_sensors = 0
        ingested = 0

        async with httpx.AsyncClient(timeout=20.0) as client:
            sensors_response = await client.get(f"{base_url}{sensors_path}", headers=self._headers())
            sensors_response.raise_for_status()
            sensors_payload = sensors_response.json()
            sensors = self._extract_list(sensors_payload, ["items", "sensors", "data"])

            for sensor in sensors:
                if not isinstance(sensor, dict):
                    continue

                sensor_id = self._extract_sensor_id(sensor)
                if not sensor_id:
                    continue

                processed_sensors += 1
                metric_name = self._extract_metric_name(sensor, default_metric)

                measurements_path = measurements_template.format(sensor_id=sensor_id, limit=limit)
                measurements_response = await client.get(
                    f"{base_url}{measurements_path}",
                    headers=self._headers(),
                )
                measurements_response.raise_for_status()
                measurements_payload = measurements_response.json()
                points = self._extract_points(measurements_payload)

                if len(points) < 6:
                    continue

                last_ts = points[-1]["timestamp"]
                prev_ts = self._last_sensor_timestamp.get(sensor_id)
                if prev_ts is not None and last_ts <= prev_ts:
                    continue

                ingested += await self._ingest_sensor(
                    source_id=sensor_id,
                    metric_name=metric_name,
                    points=points,
                    temporal_mode="hourly",
                    aggregation="none",
                    context={"ingestion_mode": "periodic_composer"},
                )
                self._last_sensor_timestamp[sensor_id] = last_ts

        return {
            "ok": True,
            "message": "ingestão periódica via composer executada",
            "processed_sensors": processed_sensors,
            "ingested": ingested,
        }

    async def run_once(self) -> Dict[str, Any]:
        async with self._lock:
            self.runtime["runs_total"] += 1
            self.runtime["last_run_at"] = datetime.utcnow().isoformat()
            processed_sensors = 0
            ingested = 0
            try:
                mode = self.config.get("ingestion_mode", "datasets")
                if mode == "composer":
                    result = await self._run_composer_mode()
                else:
                    result = await self._run_datasets_mode()

                processed_sensors = int(result.get("processed_sensors", 0))
                ingested = int(result.get("ingested", 0))

                self.runtime["last_success_at"] = datetime.utcnow().isoformat()
                self.runtime["last_error"] = None
                self.runtime["last_processed_sensors"] = processed_sensors
                self.runtime["last_ingested_measurements"] = ingested
                return {
                    "ok": bool(result.get("ok", True)),
                    "message": result.get("message", "ingestão periódica executada"),
                    "processed_sensors": processed_sensors,
                    "ingested": ingested,
                }
            except Exception as error:
                self.runtime["runs_failed"] += 1
                self.runtime["last_error"] = str(error)
                self.runtime["last_processed_sensors"] = processed_sensors
                self.runtime["last_ingested_measurements"] = ingested
                return {
                    "ok": False,
                    "message": str(error),
                    "processed_sensors": processed_sensors,
                    "ingested": ingested,
                }

    async def _run_loop(self) -> None:
        while self.runtime.get("running", False):
            result = await self.run_once()
            if not result.get("ok"):
                logger.warning("⚠️ Ingestão periódica falhou: %s", result.get("message"))
            await asyncio.sleep(max(30, int(self.config.get("interval_seconds", 300))))

    def start(self) -> bool:
        if self.runtime.get("running"):
            return False
        if not self.config.get("enabled", False):
            return False

        self.runtime["running"] = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("⏱️ Ingestão periódica iniciada (intervalo=%ss)", self.config.get("interval_seconds"))
        return True

    async def stop(self) -> bool:
        if not self.runtime.get("running"):
            return False

        self.runtime["running"] = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None
        logger.info("⏱️ Ingestão periódica parada")
        return True

    def update_config(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        allowed_keys = {
            "enabled",
            "interval_seconds",
            "ingestion_mode",
            "composer_base_url",
            "sensors_path",
            "measurements_path_template",
            "composer_token",
            "measurements_limit",
            "default_metric_name",
        }

        for key, value in updates.items():
            if key in allowed_keys and value is not None:
                self.config[key] = value

        self.config["interval_seconds"] = max(30, int(self.config.get("interval_seconds", 300)))
        self.config["measurements_limit"] = max(10, int(self.config.get("measurements_limit", 500)))
        self.config["ingestion_mode"] = str(self.config.get("ingestion_mode", "datasets")).lower()
        if self.config["ingestion_mode"] not in ["datasets", "composer"]:
            self.config["ingestion_mode"] = "datasets"

        return self.get_status()

    def get_status(self) -> Dict[str, Any]:
        return {
            "config": self.config,
            "runtime": self.runtime,
        }


periodic_ingestion_service = PeriodicIngestionService()

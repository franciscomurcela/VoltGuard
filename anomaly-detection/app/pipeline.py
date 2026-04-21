from typing import List, Dict, Any, Optional
import importlib
from datetime import datetime
import random
import logging
import httpx
import os
from app.schemas import DatasetAnalysisConfig

from .state import (
    db_webhooks,
    db_datasets,
    db_model_config,
    save_trained_model,
    save_anomaly,
    update_dataset,
)

logger = logging.getLogger("voltguard-api")


def _normalize_dataset_config(config):
    if config is not None:
        return config
    return DatasetAnalysisConfig()


def _temporal_freq(mode: str) -> str:
    mapping = {
        "hourly": "H",
        "daily": "D",
        "weekly": "W",
        "monthly": "M",
    }
    return mapping.get(mode, "D")


def _compute_severity(value: float, lower: float, upper: float) -> str:
    reference = max(abs(upper - lower), 1.0)
    deviation = max(abs(value - upper), abs(lower - value), 0.0)
    score = deviation / reference
    if score > 2.0:
        return "CRITICAL"
    if score > 1.25:
        return "HIGH"
    if score > 0.75:
        return "MEDIUM"
    return "LOW"


def _prepare_timeseries(points: List[Dict[str, Any]], config):
    pd = importlib.import_module("pandas")

    df = pd.DataFrame(points)
    if "timestamp" not in df.columns or "value" not in df.columns:
        raise ValueError("Formato inválido: esperado timestamp e value")

    df["ds"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    df["y"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.dropna(subset=["ds", "y"]).sort_values("ds")

    if config.aggregation != "none":
        freq = _temporal_freq(config.temporal_mode)
        agg_map = {
            "mean": "mean",
            "sum": "sum",
            "median": "median",
        }
        agg_method = agg_map.get(config.aggregation, "mean")
        df = (
            df.set_index("ds")
            .resample(freq)["y"]
            .agg(agg_method)
            .dropna()
            .reset_index()
        )
    else:
        df = df[["ds", "y"]]

    df["ds"] = df["ds"].dt.tz_localize(None)
    return df


def _parse_csv_points(
    csv_text: str,
    delimiter: Optional[str] = None,
    timestamp_column: Optional[str] = None,
    value_column: Optional[str] = None,
    date_column: Optional[str] = None,
    time_column: Optional[str] = None,
    timestamp_format: Optional[str] = None,
) -> List[Dict[str, Any]]:
    pd = importlib.import_module("pandas")
    io = importlib.import_module("io")

    if not csv_text.strip():
        return []

    try:
        read_kwargs = {"engine": "python"}
        if delimiter:
            read_kwargs["sep"] = delimiter
        else:
            read_kwargs["sep"] = None

        df = pd.read_csv(io.StringIO(csv_text), **read_kwargs)
    except Exception:
        return []

    if df.empty:
        return []

    normalized_to_original = {str(col).strip().lower(): col for col in df.columns}

    def pick_column(preferred: Optional[str], candidates: List[str]) -> Optional[str]:
        if preferred:
            match = normalized_to_original.get(preferred.strip().lower())
            if match is not None:
                return match
        for candidate in candidates:
            match = normalized_to_original.get(candidate)
            if match is not None:
                return match
        return None

    ts_col = pick_column(timestamp_column, ["timestamp", "ts", "datetime", "date_time", "time", "date"])
    date_col = pick_column(date_column, ["date"])
    tm_col = pick_column(time_column, ["time", "hour"])

    if ts_col is None and date_col is not None and tm_col is not None:
        df["__timestamp__"] = df[date_col].astype(str).str.strip() + " " + df[tm_col].astype(str).str.strip()
        ts_col = "__timestamp__"
    elif ts_col is None and date_col is not None:
        ts_col = date_col

    val_col = pick_column(
        value_column,
        [
            "value",
            "y",
            "measurement",
            "metric_value",
            "global_active_power",
            "global_reactive_power",
            "voltage",
            "global_intensity",
            "sub_metering_1",
            "sub_metering_2",
            "sub_metering_3",
            "pjme_mw",
        ],
    )

    if ts_col is None and len(df.columns) >= 2:
        ts_col = df.columns[0]
    if val_col is None and len(df.columns) >= 2:
        val_col = df.columns[1]

    if ts_col is None or val_col is None:
        return []

    if not timestamp_format and ts_col == "__timestamp__":
        timestamp_format = "%d/%m/%Y %H:%M:%S"

    if timestamp_format:
        timestamp_series = pd.to_datetime(df[ts_col], format=timestamp_format, utc=True, errors="coerce")
        if timestamp_series.isna().all():
            try:
                timestamp_series = pd.to_datetime(df[ts_col], utc=True, errors="coerce", format="mixed")
            except TypeError:
                timestamp_series = pd.to_datetime(df[ts_col], utc=True, errors="coerce", dayfirst=True)
    else:
        try:
            timestamp_series = pd.to_datetime(df[ts_col], utc=True, errors="coerce", format="mixed")
        except TypeError:
            timestamp_series = pd.to_datetime(df[ts_col], utc=True, errors="coerce", dayfirst=True)
    value_series = pd.to_numeric(
        df[val_col].astype(str).str.replace(",", ".", regex=False),
        errors="coerce",
    )

    parsed_df = pd.DataFrame({"timestamp": timestamp_series, "value": value_series}).dropna()
    if parsed_df.empty:
        return []

    parsed_df = parsed_df.sort_values("timestamp")
    parsed_df["timestamp"] = parsed_df["timestamp"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    return parsed_df.to_dict(orient="records")


async def _dispatch_webhook_event(event_type: str, payload: Dict[str, Any]) -> None:
    dispatch_targets: List[Dict[str, Any]] = []

    dispatch_targets.extend(db_webhooks.values())

    composer_webhook_url = os.getenv("VG_COMPOSER_WEBHOOK_URL", "").strip()
    composer_base_url = os.getenv("VG_COMPOSER_BASE_URL", "").strip().rstrip("/")
    composer_webhook_path = os.getenv("VG_COMPOSER_WEBHOOK_PATH", "").strip()

    if not composer_webhook_url and composer_base_url and composer_webhook_path:
        suffix = composer_webhook_path if composer_webhook_path.startswith("/") else f"/{composer_webhook_path}"
        composer_webhook_url = f"{composer_base_url}{suffix}"

    if composer_webhook_url:
        dispatch_targets.append(
            {
                "webhook_id": "composer_default",
                "target_url": composer_webhook_url,
                "event_type": "all",
                "status": "active",
                "use_composer_auth": True,
            }
        )

    if not dispatch_targets:
        return

    async with httpx.AsyncClient(timeout=5.0) as client:
        visited: set[str] = set()
        composer_token = os.getenv("VG_COMPOSER_TOKEN", "").strip()

        for webhook in dispatch_targets:
            webhook_event = webhook.get("event_type")
            webhook_status = webhook.get("status")
            target_url = webhook.get("target_url")

            if not target_url:
                continue
            if webhook_status != "active":
                continue
            if webhook_event not in [event_type, "all"]:
                continue

            dedupe_key = f"{target_url}:{webhook_event}"
            if dedupe_key in visited:
                continue
            visited.add(dedupe_key)

            headers = None
            if webhook.get("use_composer_auth") and composer_token:
                headers = {
                    "Authorization": f"Bearer {composer_token}",
                    "X-App-Token": composer_token,
                }

            try:
                response = await client.post(
                    target_url,
                    json={
                        "event_type": event_type,
                        "sent_at": datetime.utcnow().isoformat(),
                        "payload": payload,
                    },
                    headers=headers,
                )
                if response.status_code >= 400:
                    logger.warning(f"⚠️ Webhook {webhook.get('webhook_id')} respondeu {response.status_code}")
                else:
                    logger.info(f"📨 Webhook enviado: {webhook.get('webhook_id')} ({event_type})")
            except Exception as webhook_error:
                logger.warning(f"⚠️ Falha webhook {webhook.get('webhook_id')}: {webhook_error}")


async def _analyze_measurement_with_prophet(
    measurement_id: str,
    source_id: str,
    client_id: str,
    metric_name: str,
    points: List[Dict[str, Any]],
    config: DatasetAnalysisConfig,
) -> int:
    try:
        dataset_meta = db_datasets[measurement_id]
        update_dataset(measurement_id, {"training_status": "processing"})

        df = _prepare_timeseries(points, config)
        if len(df) < 6:
            raise ValueError("Série temporal insuficiente após limpeza/agregação (mínimo: 6)")

        split_idx = int(len(df) * config.train_ratio)
        split_idx = max(1, min(split_idx, len(df) - 1))
        train_df = df.iloc[:split_idx][["ds", "y"]]
        validation_df = df.iloc[split_idx:][["ds", "y"]]

        Prophet = importlib.import_module("prophet").Prophet
        model = Prophet(
            interval_width=db_model_config.get("prophet_uncertainty_interval", 0.95),
            daily_seasonality=True,
            weekly_seasonality=True,
            yearly_seasonality=False,
            mcmc_samples=0,
        )
        model.fit(train_df)

        save_trained_model(source_id, metric_name, model)

        forecast = model.predict(validation_df[["ds"]])
        anomalies_detected = 0

        for idx, row in forecast.iterrows():
            actual_value = float(validation_df.iloc[idx]["y"])
            lower = float(row["yhat_lower"])
            upper = float(row["yhat_upper"])
            if lower <= actual_value <= upper:
                continue

            anomaly_id = f"ANM-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{random.randint(1000, 9999)}"
            anomaly = {
                "anomaly_id": anomaly_id,
                "measurement_id": measurement_id,
                "source_id": source_id,
                "client_id": client_id,
                "metric_name": metric_name,
                "timestamp": row["ds"].isoformat(),
                "trigger_metrics": {
                    metric_name: actual_value,
                    "bounds": {
                        "yhat": float(row["yhat"]),
                        "lower": lower,
                        "upper": upper,
                    },
                },
                "detection_method": "Prophet",
                "confidence_score": 0.9,
                "severity": _compute_severity(actual_value, lower, upper),
                "model_id": db_model_config.get("model_id", "model_prophet_v1"),
            }
            save_anomaly(anomaly_id, anomaly)
            anomalies_detected += 1

            await _dispatch_webhook_event(
                "anomaly_detected",
                {
                    "anomaly_id": anomaly_id,
                    "measurement_id": measurement_id,
                    "source_id": source_id,
                    "client_id": client_id,
                    "metric_name": metric_name,
                    "timestamp": anomaly["timestamp"],
                    "severity": anomaly["severity"],
                },
            )

        update_dataset(
            measurement_id,
            {
                "training_status": "analyzed",
                "last_trained": datetime.utcnow().isoformat(),
                "anomalies_detected": anomalies_detected,
            },
        )
        dataset_meta = db_datasets.get(measurement_id, dataset_meta)

        await _dispatch_webhook_event(
            "measurement_processed",
            {
                "measurement_id": measurement_id,
                "source_id": source_id,
                "client_id": client_id,
                "metric_name": metric_name,
                "status": dataset_meta["training_status"],
                "anomalies_detected": anomalies_detected,
            },
        )

        return anomalies_detected
    except Exception as analysis_error:
        dataset_meta = db_datasets.get(measurement_id)
        if dataset_meta:
            update_dataset(
                measurement_id,
                {
                    "training_status": "failed",
                    "error": str(analysis_error),
                },
            )
        raise

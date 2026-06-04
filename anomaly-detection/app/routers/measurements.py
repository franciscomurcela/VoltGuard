import uuid
from datetime import datetime
import logging
import importlib
import io
import zipfile

import httpx
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from typing import Optional

from app.deps import verify_token
from app.schemas import (
    DatasetUploadRequest,
    DatasetUploadResponse,
    DatasetAnalysisConfig,
    DatasetImportRequest,
    DatasetListResponse,
    DatasetInfo,
)
from app.pipeline import _normalize_dataset_config, _parse_csv_points, _analyze_measurement_with_prophet
from app.state import db_datasets, save_dataset

logger = logging.getLogger("voltguard-api")
router = APIRouter(tags=["1. Ingestion & Measurements"])


MAX_IMPORT_ANALYSIS_POINTS = 50000
MAX_IMPORT_READ_LINES = 1000
MAX_IMPORT_ANALYSIS_POINTS = 100


def _read_limited_text_lines(stream, max_lines: int) -> str:
    lines = []
    for idx, line in enumerate(stream):
        if idx >= max_lines:
            break
        lines.append(line)
    return "".join(lines)


def _downsample_points(points, max_points: int):
    total = len(points)
    if total <= max_points:
        return points

    step = (total - 1) / (max_points - 1)
    sampled = []
    seen = set()
    for i in range(max_points):
        idx = int(round(i * step))
        if idx < total and idx not in seen:
            sampled.append(points[idx])
            seen.add(idx)

    if sampled and sampled[-1] != points[-1]:
        sampled[-1] = points[-1]
    return sampled


@router.post(
    "/v1/measurements",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=DatasetUploadResponse,
    summary="Upload de medições históricas (JSON)",
)
async def upload_dataset_json(request: DatasetUploadRequest, token: str = Depends(verify_token)):
    measurement_id = f"meas_{uuid.uuid4().hex[:8]}"
    sorted_points = sorted(request.dataset, key=lambda p: p.timestamp)
    total = len(sorted_points)
    normalized_config = _normalize_dataset_config(request.config)
    context_client_id = (normalized_config.context or {}).get("client_id") if normalized_config else None
    client_id = request.client_id or context_client_id or request.source_id
    split_idx = int(total * normalized_config.train_ratio)

    input_points = [p.dict() for p in sorted_points]

    meta = {
        "measurement_id": measurement_id,
        "source_id": request.source_id,
        "client_id": client_id,
        "metric_name": request.metric_name,
        "points": input_points,
        "rows": total,
        "rows_training": split_idx,
        "rows_forecast": total - split_idx,
        "period_start": sorted_points[0].timestamp,
        "period_end": sorted_points[-1].timestamp,
        "config": normalized_config.dict(),
        "training_status": "queued",
        "last_trained": None,
        "uploaded_at": datetime.utcnow().isoformat(),
    }
    save_dataset(measurement_id, meta)

    anomalies_detected = await _analyze_measurement_with_prophet(
        measurement_id=measurement_id,
        source_id=request.source_id,
        client_id=client_id,
        metric_name=request.metric_name,
        points=input_points,
        config=normalized_config,
    )

    logger.info(
        f"📂 Measurements {measurement_id}: {request.source_id}/{request.metric_name} — {total} pontos "
        f"(treino={split_idx}, forecast={total - split_idx})"
    )
    return DatasetUploadResponse(
        measurement_id=measurement_id,
        source_id=request.source_id,
        metric_name=request.metric_name,
        rows_received=total,
        rows_training=split_idx,
        rows_forecast=total - split_idx,
        status=f"analyzed ({anomalies_detected} anomalias)",
    )


@router.post(
    "/v1/measurements/csv",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload de medições históricas (CSV)",
)
async def upload_dataset_csv(
    file: UploadFile = File(..., description="Ficheiro CSV com colunas: timestamp,value"),
    source_id: str = Form(..., description="ID do sensor"),
    client_id: Optional[str] = Form(None, description="ID lógico do cliente"),
    metric_name: str = Form(..., description="Nome da métrica (ex: voltage)"),
    train_ratio: float = Form(0.8, description="Percentagem de treino (0.5-0.95)"),
    temporal_mode: str = Form("daily", description="Granularidade temporal: hourly|daily|weekly|monthly"),
    aggregation: str = Form("none", description="Agregação temporal: none|mean|sum|median"),
    timezone: str = Form("UTC", description="Timezone de referência"),
    token: str = Depends(verify_token),
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Apenas ficheiros .csv são suportados.")

    contents = await file.read()
    lines = contents.decode("utf-8").strip().splitlines()
    dataset = []
    for line in lines[1:]:
        parts = line.split(",")
        if len(parts) >= 2:
            try:
                dataset.append({"timestamp": parts[0].strip(), "value": float(parts[1].strip())})
            except ValueError:
                continue

    if len(dataset) < 6:
        raise HTTPException(status_code=400, detail=f"Dataset insuficiente: {len(dataset)} pontos (mínimo: 6)")

    measurement_id = f"meas_{uuid.uuid4().hex[:8]}"
    sorted_points = sorted(dataset, key=lambda p: p["timestamp"])
    total = len(sorted_points)

    try:
        normalized_config = DatasetAnalysisConfig(
            train_ratio=train_ratio,
            temporal_mode=temporal_mode,
            aggregation=aggregation,
            timezone=timezone,
            context={"input_type": "csv"},
        )
    except Exception as config_error:
        raise HTTPException(status_code=400, detail=f"Configuração inválida: {config_error}")

    split_idx = int(total * train_ratio)
    resolved_client_id = client_id or source_id
    meta = {
        "measurement_id": measurement_id,
        "source_id": source_id,
        "client_id": resolved_client_id,
        "metric_name": metric_name,
        "points": sorted_points,
        "rows": total,
        "rows_training": split_idx,
        "rows_forecast": total - split_idx,
        "period_start": sorted_points[0]["timestamp"],
        "period_end": sorted_points[-1]["timestamp"],
        "config": normalized_config.dict(),
        "training_status": "queued",
        "last_trained": None,
        "uploaded_at": datetime.utcnow().isoformat(),
    }
    save_dataset(measurement_id, meta)

    anomalies_detected = await _analyze_measurement_with_prophet(
        measurement_id=measurement_id,
        source_id=source_id,
        client_id=resolved_client_id,
        metric_name=metric_name,
        points=sorted_points,
        config=normalized_config,
    )

    logger.info(f"📂 CSV {measurement_id}: {source_id}/{metric_name} — {total} pontos")
    return {
        "measurement_id": measurement_id,
        "source_id": source_id,
        "metric_name": metric_name,
        "rows_received": total,
        "rows_training": split_idx,
        "rows_forecast": total - split_idx,
        "status": f"analyzed ({anomalies_detected} anomalias)",
    }


@router.post(
    "/v1/measurements/import",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=DatasetUploadResponse,
    summary="Importar medições históricas a partir de URL (CSV)",
)
async def import_measurements_from_url(request: DatasetImportRequest, token: str = Depends(verify_token)):
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(request.source_url)
            response.raise_for_status()
            content_type = (response.headers.get("content-type") or "").lower()
            is_zip = request.source_url.lower().endswith(".zip") or "application/zip" in content_type

            if is_zip:
                zip_buffer = io.BytesIO(response.content)
                with zipfile.ZipFile(zip_buffer) as archive:
                    infos = [
                        info for info in archive.infolist()
                        if not info.is_dir() and info.filename.lower().endswith((".csv", ".txt"))
                    ]
                    candidates = sorted(
                        infos,
                        key=lambda info: (
                            1 if "readme" in info.filename.lower() else 0,
                            -info.file_size,
                        ),
                    )
                    if not candidates:
                        raise ValueError("ZIP sem ficheiros .csv/.txt")
                    with archive.open(candidates[0]) as extracted:
                        text_stream = io.TextIOWrapper(extracted, encoding="utf-8", errors="replace")
                        csv_text = _read_limited_text_lines(text_stream, MAX_IMPORT_READ_LINES)
            else:
                csv_text = _read_limited_text_lines(io.StringIO(response.text), MAX_IMPORT_READ_LINES)
    except Exception as fetch_error:
        raise HTTPException(status_code=400, detail=f"Falha ao obter dataset remoto: {fetch_error}")

    imported_points = _parse_csv_points(
        csv_text,
        delimiter=request.delimiter,
        timestamp_column=request.timestamp_column,
        value_column=request.value_column,
        date_column=request.date_column,
        time_column=request.time_column,
    )
    if len(imported_points) < 6:
        raise HTTPException(
            status_code=400,
            detail=f"Dataset remoto insuficiente: {len(imported_points)} pontos (mínimo: 6)",
        )

    measurement_id = f"meas_{uuid.uuid4().hex[:8]}"
    sorted_points = sorted(imported_points, key=lambda item: item["timestamp"])
    total = len(sorted_points)
    analysis_points = _downsample_points(sorted_points, MAX_IMPORT_ANALYSIS_POINTS)
    analysis_total = len(analysis_points)

    normalized_config = _normalize_dataset_config(request.config)
    context_client_id = (normalized_config.context or {}).get("client_id") if normalized_config else None
    client_id = request.client_id or context_client_id or request.source_id
    split_idx = int(analysis_total * normalized_config.train_ratio)

    meta = {
        "measurement_id": measurement_id,
        "source_id": request.source_id,
        "client_id": client_id,
        "metric_name": request.metric_name,
        "points": sorted_points,
        "analysis_points": len(analysis_points),
        "rows_original": total,
        "rows": total,
        "rows_training": split_idx,
        "rows_forecast": analysis_total - split_idx,
        "period_start": sorted_points[0]["timestamp"],
        "period_end": sorted_points[-1]["timestamp"],
        "config": normalized_config.dict(),
        "training_status": "queued",
        "last_trained": None,
        "uploaded_at": datetime.utcnow().isoformat(),
        "imported_from": request.source_url,
    }
    save_dataset(measurement_id, meta)
    logger.info(
        f"📥 Import queued {measurement_id}: {request.source_id}/{request.metric_name} — "
        f"rows={total}, queued_for_analysis=true"
    )

    return DatasetUploadResponse(
        measurement_id=measurement_id,
        source_id=request.source_id,
        metric_name=request.metric_name,
        rows_received=total,
        rows_training=split_idx,
        rows_forecast=analysis_total - split_idx,
        status="queued",
    )


@router.get(
    "/v1/measurements",
    response_model=DatasetListResponse,
    summary="Listar medições históricas (opcionalmente por sensor)",
)
async def list_datasets(source_id: Optional[str] = None, token: str = Depends(verify_token)):
    if source_id:
        datasets = [DatasetInfo(**v) for v in db_datasets.values() if v.get("source_id") == source_id]
        return DatasetListResponse(source_id=source_id, measurements=datasets)

    datasets = [DatasetInfo(**v) for v in db_datasets.values()]
    return DatasetListResponse(source_id=None, measurements=datasets)


@router.get(
    "/v1/measurements/{measurement_id}",
    response_model=DatasetInfo,
    summary="Obter detalhes de uma medição histórica",
)
async def get_dataset(measurement_id: str, token: str = Depends(verify_token)):
    dataset = db_datasets.get(measurement_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medição histórica não encontrada.",
        )
    return DatasetInfo(**dataset)


@router.get(
    "/v1/measurements/{measurement_id}/full",
    response_model=DatasetInfo,
    summary="Obter medição completa (inclui pontos)",
)
async def get_dataset_full(measurement_id: str, token: str = Depends(verify_token)):
    dataset = db_datasets.get(measurement_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medição histórica não encontrada.",
        )
    return DatasetInfo(**dataset)


@router.post(
    "/v1/measurements/reprocess/{source_id}",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=DatasetUploadResponse,
    summary="Reprocessar as medições mais recentes por sensor",
)
async def reprocess_latest_dataset(
    source_id: str,
    metric_name: Optional[str] = None,
    token: str = Depends(verify_token),
):
    candidates = [
        item for item in db_datasets.values()
        if item.get("source_id") == source_id
    ]

    if metric_name:
        candidates = [item for item in candidates if item.get("metric_name") == metric_name]

    if not candidates:
        target = f"source_id={source_id}" + (f", metric_name={metric_name}" if metric_name else "")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nenhuma medição encontrada para {target}.",
        )

    candidates.sort(key=lambda item: item.get("uploaded_at") or "", reverse=True)
    latest = candidates[0]
    input_points = latest.get("points")
    if not input_points or not isinstance(input_points, list):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A medição selecionada não contém pontos persistidos para reprocessamento. "
                "Reenvie dados para este sensor e tente novamente."
            ),
        )

    requested_metric = metric_name or latest.get("metric_name")
    measurement_id = f"meas_{uuid.uuid4().hex[:8]}"
    sorted_points = sorted(input_points, key=lambda p: p.get("timestamp", ""))
    total = len(sorted_points)

    config_payload = latest.get("config") or {}
    try:
        normalized_config = _normalize_dataset_config(DatasetAnalysisConfig(**config_payload))
    except Exception:
        normalized_config = _normalize_dataset_config(None)
    split_idx = int(total * normalized_config.train_ratio)
    resolved_client_id = latest.get("client_id") or source_id

    meta = {
        "measurement_id": measurement_id,
        "source_id": source_id,
        "client_id": resolved_client_id,
        "metric_name": requested_metric,
        "points": sorted_points,
        "rows": total,
        "rows_training": split_idx,
        "rows_forecast": total - split_idx,
        "period_start": sorted_points[0].get("timestamp"),
        "period_end": sorted_points[-1].get("timestamp"),
        "config": normalized_config.dict(),
        "training_status": "queued",
        "last_trained": None,
        "uploaded_at": datetime.utcnow().isoformat(),
        "reprocessed_from": latest.get("measurement_id"),
    }
    save_dataset(measurement_id, meta)

    anomalies_detected = await _analyze_measurement_with_prophet(
        measurement_id=measurement_id,
        source_id=source_id,
        client_id=resolved_client_id,
        metric_name=requested_metric,
        points=sorted_points,
        config=normalized_config,
    )

    return DatasetUploadResponse(
        measurement_id=measurement_id,
        source_id=source_id,
        metric_name=requested_metric,
        rows_received=total,
        rows_training=split_idx,
        rows_forecast=total - split_idx,
        status=f"reanalyzed ({anomalies_detected} anomalias)",
    )

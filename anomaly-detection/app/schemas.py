from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Optional, Any, Literal


class APIBaseModel(BaseModel):
    model_config = ConfigDict(protected_namespaces=())


class AnomalySummary(APIBaseModel):
    anomaly_id: str
    measurement_id: str
    source_id: str
    client_id: Optional[str] = None
    timestamp: str
    severity: str
    model_id: Optional[str] = None


class AnomalyDetail(APIBaseModel):
    anomaly_id: str
    measurement_id: str
    source_id: str
    client_id: Optional[str] = None
    timestamp: str
    trigger_metrics: Dict[str, Any]
    detection_method: str
    confidence_score: float
    severity: Optional[str] = None
    model_id: Optional[str] = None


class AIModelInfo(APIBaseModel):
    model_id: str
    model_type: str
    provider: str
    version: str
    status: str


class ModelConfig(APIBaseModel):
    model_id: str = Field(..., min_length=3, description="ID único do modelo de IA")
    prophet_uncertainty_interval: float = Field(..., ge=0.5, le=0.99, description="Intervalo de incerteza (0.5-0.99)")
    pyod_contamination_rate: float = Field(..., ge=0.01, le=0.5, description="Taxa de contaminação (0.01-0.5)")


class ForecastPoint(APIBaseModel):
    timestamp: str = Field(..., description="ISO 8601 timestamp")
    yhat: float = Field(..., description="Point estimate (mean forecast)")
    yhat_lower: float = Field(..., description="Lower bound (confidence interval)")
    yhat_upper: float = Field(..., description="Upper bound (confidence interval)")


class ForecastResponse(APIBaseModel):
    sensor_id: str = Field(..., description="Sensor identifier")
    client_id: Optional[str] = Field(None, description="Client identifier associated with sensor/data source")
    metric_name: str = Field(..., description="Metric name (e.g., 'voltage')")
    model_id: str = Field(..., description="Model ID used for forecast")
    forecasts: List[ForecastPoint] = Field(..., min_items=1, description="Forecast points")
    last_training: Optional[str] = Field(None, description="When the model was last trained")
    periods: int = Field(..., description="Number of periods forecasted")


class LatestForecastResponse(APIBaseModel):
    forecast_id: str
    sensor_id: str
    client_id: Optional[str] = None
    metric_name: str
    model_id: str
    periods: int
    last_training: Optional[str] = None
    requested_at: Optional[str] = None
    forecasts: List[ForecastPoint] = Field(default_factory=list)


class SensorAnomalyAggregate(APIBaseModel):
    source_id: str
    client_id: Optional[str] = None
    measurements_total: int
    measurements_with_anomaly: int
    anomalies_total: int
    measurement_anomaly_rate: float
    anomalies_per_measurement: float
    latest_anomaly_id: Optional[str] = None
    latest_anomaly_timestamp: Optional[str] = None
    latest_severity: Optional[str] = None


class SensorAnomalyAggregateResponse(APIBaseModel):
    items: List[SensorAnomalyAggregate]
    total_sensors: int


class WebhookSubscription(APIBaseModel):
    target_url: str = Field(..., pattern=r'^https?://', description="URL do webhook (http/https)")
    event_type: str = Field(..., pattern=r'^(anomaly_detected|measurement_processed|all)$')


class WebhookResponse(APIBaseModel):
    webhook_id: str
    target_url: str
    event_type: str
    status: str
    model_ids: List[str] = []


class HealthStatus(APIBaseModel):
    status: str
    database: str


class TokenRequest(APIBaseModel):
    service_name: str = Field(..., min_length=3, max_length=100)


class PaginatedAnomalyResponse(APIBaseModel):
    items: List[AnomalySummary]
    total: int
    limit: int
    offset: int
    has_more: bool


class TokenResponse(APIBaseModel):
    token_id: str
    token: str
    service_name: str
    created_at: str


class DatasetPoint(APIBaseModel):
    timestamp: str = Field(..., description="Timestamp ISO 8601")
    value: float = Field(..., description="Valor da métrica neste instante")


class DatasetAnalysisConfig(APIBaseModel):
    train_ratio: float = Field(0.8, ge=0.5, le=0.95, description="Percentagem para treino do Prophet")
    temporal_mode: Literal["hourly", "daily", "weekly", "monthly"] = Field(
        "daily",
        description="Granularidade temporal da análise"
    )
    aggregation: Literal["none", "mean", "sum", "median"] = Field(
        "none",
        description="Método de agregação temporal"
    )
    timezone: str = Field("UTC", description="Timezone de referência para análise temporal")
    context: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Contexto adicional dos dados (ex: localização, tipo de sensor, ambiente)"
    )


class DatasetUploadRequest(APIBaseModel):
    source_id: str = Field(..., description="ID do sensor/fonte dos dados")
    client_id: Optional[str] = Field(None, description="ID lógico do cliente/dono da medição")
    metric_name: str = Field(..., description="Nome da métrica (ex: voltage, current)")
    config: DatasetAnalysisConfig = Field(default_factory=DatasetAnalysisConfig)
    dataset: List[DatasetPoint] = Field(
        ..., min_items=6,
        description="Série temporal histórica. O Prophet usa 80% para treino e 20% para forecast."
    )


class DatasetImportRequest(APIBaseModel):
    source_url: str = Field(..., pattern=r'^https?://', description="URL HTTP/HTTPS para CSV")
    source_id: str = Field(..., description="ID do sensor/fonte dos dados")
    client_id: Optional[str] = Field(None, description="ID lógico do cliente/dono da medição")
    metric_name: str = Field(..., description="Nome da métrica (ex: voltage, current)")
    delimiter: Optional[str] = Field(None, description="Delimitador opcional (ex: ',', ';')")
    timestamp_column: Optional[str] = Field(None, description="Nome da coluna de timestamp")
    value_column: Optional[str] = Field(None, description="Nome da coluna de valor numérico")
    date_column: Optional[str] = Field(None, description="Nome da coluna de data quando timestamp está dividido")
    time_column: Optional[str] = Field(None, description="Nome da coluna de hora quando timestamp está dividido")
    config: DatasetAnalysisConfig = Field(default_factory=DatasetAnalysisConfig)


class DatasetUploadResponse(APIBaseModel):
    measurement_id: str
    source_id: str
    metric_name: str
    rows_received: int
    rows_training: int
    rows_forecast: int
    status: str


class DatasetInfo(APIBaseModel):
    measurement_id: str
    source_id: str
    client_id: Optional[str] = None
    metric_name: str
    rows: int
    rows_training: int
    rows_forecast: int
    period_start: str
    period_end: str
    config: Optional[Dict[str, Any]] = None
    training_status: str
    last_trained: Optional[str] = None


class DatasetListResponse(APIBaseModel):
    source_id: Optional[str] = None
    measurements: List[DatasetInfo]

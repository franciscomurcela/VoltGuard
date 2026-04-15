from datetime import datetime
import importlib
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import verify_token
from app.schemas import AIModelInfo, ModelConfig, ForecastResponse, ForecastPoint
from app.state import db_ai_models, db_model_config, db_trained_models, save_model_config

logger = logging.getLogger("voltguard-api")
router = APIRouter(tags=["3. Model Management"])


@router.get("/v1/models", response_model=list[AIModelInfo])
async def list_models(token: str = Depends(verify_token)):
    logger.debug("🤖 Lista de modelos consultada")
    return [AIModelInfo(**model) for model in db_ai_models.values()]


@router.get("/v1/models/{model_id}/config", response_model=ModelConfig)
async def get_model_config(model_id: str, token: str = Depends(verify_token)):
    if model_id not in db_ai_models:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Modelo de IA não encontrado.",
        )

    logger.debug(f"⚙️ Configuração do modelo consultada: {model_id}")
    return ModelConfig(**db_model_config)


@router.put("/v1/models/{model_id}/config", response_model=ModelConfig)
async def update_model_config(model_id: str, config: ModelConfig, token: str = Depends(verify_token)):
    if model_id not in db_ai_models:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Modelo de IA não encontrado.",
        )

    if config.model_id != model_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="model_id no corpo deve corresponder ao model_id da URL.",
        )

    old_config = db_model_config.copy()
    save_model_config(
        {
            "model_id": model_id,
            "prophet_uncertainty_interval": config.prophet_uncertainty_interval,
            "pyod_contamination_rate": config.pyod_contamination_rate,
        }
    )

    logger.info(
        f"⚙️ Modelo {model_id} recalibrado: Prophet "
        f"{old_config['prophet_uncertainty_interval']}->{config.prophet_uncertainty_interval}, "
        f"PyOD {old_config['pyod_contamination_rate']}->{config.pyod_contamination_rate}"
    )

    return ModelConfig(**db_model_config)


@router.get("/v1/forecasts/{sensor_id}", response_model=ForecastResponse)
async def get_forecast(
    sensor_id: str,
    periods: int = 24,
    metric_name: str = "voltage",
    model_id: str = "model_prophet_v1",
    token: str = Depends(verify_token),
):
    try:
        pd = importlib.import_module("pandas")
        model = db_trained_models.get(f"{sensor_id}:{metric_name}")
        if not model:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Nenhum modelo treinado encontrado para sensor={sensor_id}, metric={metric_name}. Execute medições primeiro.",
            )

        last_date = datetime.now()
        future_dates = pd.date_range(start=last_date, periods=periods + 1, freq="h")[1:]
        future_df = pd.DataFrame({"ds": future_dates})

        forecast = model.predict(future_df)

        forecast_points = []
        for _, row in forecast.iterrows():
            point = ForecastPoint(
                timestamp=row["ds"].isoformat(),
                yhat=float(row["yhat"]),
                yhat_lower=float(row["yhat_lower"]),
                yhat_upper=float(row["yhat_upper"]),
            )
            forecast_points.append(point)

        logger.info(f"🔮 Forecast gerado: sensor={sensor_id}, periods={periods}, model={model_id}")

        return ForecastResponse(
            sensor_id=sensor_id,
            metric_name=metric_name,
            model_id=model_id,
            forecasts=forecast_points,
            last_training=datetime.now().isoformat(),
            periods=periods,
        )

    except HTTPException:
        raise
    except Exception as error:
        logger.error(f"❌ Erro ao gerar forecast: {error}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao gerar forecast: {str(error)}",
        )

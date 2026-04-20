from typing import Dict, Any, Optional, List
import os
import importlib
import logging

# In-memory store for anomalies
_db_anomalies: Dict[str, Dict[str, Any]] = {}
_db_forecasts: Dict[str, Dict[str, Any]] = {}

logger = logging.getLogger("voltguard-api")

_mongo_client = None
_mongo_db = None
_mongo_enabled = False


def _get_collection(name: str):
    if not _mongo_enabled or _mongo_db is None:
        return None
    return _mongo_db[name]


def init_persistence() -> None:
    global _mongo_client, _mongo_db, _mongo_enabled

    mongo_uri = os.getenv("VG_MONGO_URI", "").strip()
    mongo_db_name = os.getenv("VG_MONGO_DB", "voltguard")

    if not mongo_uri:
        logger.info("🧠 Persistência MongoDB desativada (VG_MONGO_URI não definido)")
        _mongo_enabled = False
        return

    try:
        pymongo = importlib.import_module("pymongo")
        MongoClient = pymongo.MongoClient
        _mongo_client = MongoClient(mongo_uri, serverSelectionTimeoutMS=2000)
        _mongo_client.admin.command("ping")
        _mongo_db = _mongo_client[mongo_db_name]
        _mongo_enabled = True

        datasets_col = _get_collection("datasets")
        anomalies_col = _get_collection("anomalies")
        forecasts_col = _get_collection("forecasts")
        webhooks_col = _get_collection("webhooks")
        model_col = _get_collection("model_config")

        if datasets_col is not None:
            datasets_col.create_index("measurement_id", unique=True)
            datasets_col.create_index("source_id")
            datasets_col.create_index("client_id")
            datasets_col.create_index("uploaded_at")

        if anomalies_col is not None:
            anomalies_col.create_index("anomaly_id", unique=True)
            anomalies_col.create_index("measurement_id")
            anomalies_col.create_index("source_id")
            anomalies_col.create_index("client_id")
            anomalies_col.create_index("timestamp")

        if forecasts_col is not None:
            forecasts_col.create_index("forecast_id", unique=True)
            forecasts_col.create_index("sensor_id")
            forecasts_col.create_index("client_id")
            forecasts_col.create_index("requested_at")

        if webhooks_col is not None:
            webhooks_col.create_index("webhook_id", unique=True)

        if datasets_col is not None:
            for doc in datasets_col.find({}, {"_id": 0}):
                measurement_id = doc.get("measurement_id")
                if measurement_id:
                    _db_datasets[measurement_id] = doc

        if anomalies_col is not None:
            for doc in anomalies_col.find({}, {"_id": 0}):
                anomaly_id = doc.get("anomaly_id")
                if anomaly_id:
                    _db_anomalies[anomaly_id] = doc

        if forecasts_col is not None:
            for doc in forecasts_col.find({}, {"_id": 0}):
                forecast_id = doc.get("forecast_id")
                if forecast_id:
                    _db_forecasts[forecast_id] = doc

        if webhooks_col is not None:
            for doc in webhooks_col.find({}, {"_id": 0}):
                webhook_id = doc.get("webhook_id")
                if webhook_id:
                    _db_webhooks[webhook_id] = doc

        if model_col is not None:
            doc = model_col.find_one({"model_id": _db_model_config["model_id"]}, {"_id": 0})
            if doc:
                _db_model_config.update(doc)

        logger.info("✅ Persistência MongoDB ativa: db=%s", mongo_db_name)
    except ModuleNotFoundError:
        _mongo_enabled = False
        logger.warning("⚠️ pymongo não instalado; a API continuará em memória")
    except Exception as error:
        _mongo_enabled = False
        logger.warning("⚠️ Falha ao iniciar MongoDB (%s); fallback para memória", error)


def is_persistence_enabled() -> bool:
    return _mongo_enabled


def save_dataset(measurement_id: str, dataset_data: Dict[str, Any]) -> None:
    _db_datasets[measurement_id] = dataset_data
    collection = _get_collection("datasets")
    if collection is not None:
        collection.replace_one({"measurement_id": measurement_id}, dataset_data, upsert=True)


def update_dataset(measurement_id: str, updates: Dict[str, Any]) -> None:
    dataset = _db_datasets.get(measurement_id)
    if not dataset:
        return
    dataset.update(updates)
    collection = _get_collection("datasets")
    if collection is not None:
        collection.update_one({"measurement_id": measurement_id}, {"$set": updates}, upsert=False)


def save_webhook(webhook_id: str, webhook_data: Dict[str, Any]) -> None:
    _db_webhooks[webhook_id] = webhook_data
    collection = _get_collection("webhooks")
    if collection is not None:
        collection.replace_one({"webhook_id": webhook_id}, webhook_data, upsert=True)


def delete_webhook(webhook_id: str) -> None:
    if webhook_id in _db_webhooks:
        del _db_webhooks[webhook_id]
    collection = _get_collection("webhooks")
    if collection is not None:
        collection.delete_one({"webhook_id": webhook_id})


def save_model_config(config_data: Dict[str, Any]) -> None:
    _db_model_config.update(config_data)
    collection = _get_collection("model_config")
    if collection is not None:
        model_id = config_data.get("model_id", _db_model_config.get("model_id"))
        collection.replace_one({"model_id": model_id}, _db_model_config, upsert=True)


def save_anomaly(anomaly_id: str, anomaly_data: Dict[str, Any]) -> None:
    _db_anomalies[anomaly_id] = anomaly_data
    collection = _get_collection("anomalies")
    if collection is not None:
        collection.replace_one({"anomaly_id": anomaly_id}, anomaly_data, upsert=True)


def save_forecast(forecast_id: str, forecast_data: Dict[str, Any]) -> None:
    _db_forecasts[forecast_id] = forecast_data
    collection = _get_collection("forecasts")
    if collection is not None:
        collection.replace_one({"forecast_id": forecast_id}, forecast_data, upsert=True)


def get_anomaly(anomaly_id: str) -> Optional[Dict[str, Any]]:
    return _db_anomalies.get(anomaly_id)


def get_all_anomalies() -> List[Dict[str, Any]]:
    return list(_db_anomalies.values())


def get_all_forecasts() -> List[Dict[str, Any]]:
    return list(_db_forecasts.values())


def get_forecasts_by_sensor(sensor_id: str) -> List[Dict[str, Any]]:
    forecasts = [item for item in _db_forecasts.values() if item.get("sensor_id") == sensor_id]
    forecasts.sort(key=lambda item: item.get("requested_at") or "", reverse=True)
    return forecasts


def get_latest_forecast(sensor_id: str) -> Optional[Dict[str, Any]]:
    forecasts = get_forecasts_by_sensor(sensor_id)
    if not forecasts:
        return None
    return forecasts[0]


# In-memory operational stores
_db_webhooks: Dict[str, Any] = {}
_db_tokens = {"token_do_composer_123": "Energy Composer", "token_admin_999": "Admin Service"}
_db_datasets: Dict[str, Any] = {}
_db_trained_models: Dict[str, Any] = {}
_db_ai_models = {
    "model_prophet_v1": {
        "model_id": "model_prophet_v1",
        "model_type": "time-series",
        "provider": "Prophet",
        "version": "1.0.0",
        "status": "active",
    }
}
_db_model_config = {
    "model_id": "model_prophet_v1",
    "prophet_uncertainty_interval": 0.95,
    "pyod_contamination_rate": 0.05,
}

# Export aliases consumed by main.py
# Keep names aligned with existing code to avoid endpoint contract changes.
db_webhooks = _db_webhooks
db_tokens = _db_tokens
db_datasets = _db_datasets
db_trained_models = _db_trained_models
db_ai_models = _db_ai_models
db_model_config = _db_model_config
db_forecasts = _db_forecasts

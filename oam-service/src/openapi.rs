use utoipa::OpenApi;

use crate::{
    error::ErrorBody,
    handlers::{
        actions::ActionUpdateInput,
        firmware::FirmwareUploadRequest,
        keepalive::KeepAliveResponse,
    },
    models::{
        anomaly::{AnomalyInput, AnomalyLog},
        firmware::Firmware,
        sensor::{AnomalyStatus, PendingAction, Sensor, SensorInput},
    },
};

#[derive(OpenApi)]
#[openapi(
    paths(
        crate::handlers::sensors::create,
        crate::handlers::sensors::list,
        crate::handlers::sensors::get_one,
        crate::handlers::sensors::delete,
        crate::handlers::firmware::upload,
        crate::handlers::firmware::list,
        crate::handlers::firmware::download,
        crate::handlers::actions::update_firmware,
        crate::handlers::actions::reboot,
        crate::handlers::actions::clear_anomaly,
        crate::handlers::anomaly::report,
        crate::handlers::keepalive::keepalive,
    ),
    components(schemas(
        Sensor, SensorInput, AnomalyStatus, PendingAction,
        Firmware, FirmwareUploadRequest,
        AnomalyInput, AnomalyLog,
        KeepAliveResponse, ActionUpdateInput,
        ErrorBody,
    )),
    tags(
        (name = "Sensors", description = "Sensor inventory management"),
        (name = "Firmware", description = "Firmware uploads and downloads"),
        (name = "Actions", description = "Schedule actions on sensors"),
        (name = "Anomalies", description = "Anomaly reporting from sensors"),
        (name = "Keepalive", description = "Sensor heartbeat and action delivery"),
    ),
    info(
        title = "VoltGuard OAM Service",
        version = "0.1.0",
        description = "Operations, Administration and Maintenance API for VoltGuard sensors",
    )
)]
pub struct ApiDoc;

# OAM Service — API Documentation

**Base URL:** `http://localhost:8084`
**Content-Type:** `application/json` (except firmware upload which uses `multipart/form-data`)
**Authentication:** None (handled by the Compositor layer)
**Interactive docs:** `http://localhost:8084/swagger-ui`

---

## Data Models

### Sensor

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Unique identifier |
| `name` | string | Human-readable name |
| `district` | string | Portuguese district |
| `anomaly_status` | `NONE` \| `DETECTED` | Whether an anomaly is currently active |
| `pending_action` | `NONE` \| `REBOOT` | Action waiting to be delivered on next keepalive |
| `firmware_update_pending` | boolean | Firmware has been staged but the sensor hasn't rebooted yet |
| `current_firmware_id` | UUID \| null | Firmware currently installed |
| `ultimo_keepalive` | ISO 8601 \| null | Timestamp of last keepalive received |
| `created_at` | ISO 8601 | Registration timestamp |

### Firmware

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Unique identifier |
| `version` | string | Version label (e.g. `v2.1.0`) |
| `uploaded_at` | ISO 8601 | Upload timestamp |

### KeepAliveResponse

| Field | Type | Description |
|---|---|---|
| `action` | `NONE` \| `REBOOT` | Pending action for the device |
| `target_firmware_id` | UUID \| omitted | Only present when a firmware update was staged and action is `REBOOT` |
| `download_link` | string \| omitted | Direct download URL for the staged firmware binary |

### Error

| Field | Type | Description |
|---|---|---|
| `error` | string | Error category (e.g. `"Bad Request"`, `"Not Found"`) |
| `message` | string | Human-readable detail |

---

## Endpoints

### Health

#### `GET /health`
Returns service status.

**Response `200`**
```json
{ "status": "healthy" }
```

---

### Sensors

#### `POST /sensors`
Register a new sensor.

**Request body**
```json
{
  "name": "Sensor Lisboa Norte",
  "district": "Lisboa",
  "firmware_id": "uuid-optional"
}
```
`firmware_id` is optional. If provided, the firmware must already exist.

**Response `201`** — created `Sensor`
**Response `400`** — name or district is empty
**Response `404`** — firmware_id not found
**Response `409`** — sensor name already exists

---

#### `GET /sensors`
List all sensors. Supports pagination.

| Param | Default | Max |
|---|---|---|
| `page` | 1 | — |
| `limit` | 10 | 100 |

**Response `200`** — array of `Sensor`

```json
[
  {
    "id": "fff2f6f4-8164-4d1c-9433-9eb844e0d02e",
    "name": "CasaDoPovo",
    "district": "Faro",
    "anomaly_status": "NONE",
    "pending_action": "NONE",
    "firmware_update_pending": false,
    "current_firmware_id": null,
    "ultimo_keepalive": null,
    "created_at": "2026-03-17T20:32:00.071199Z"
  }
]
```

---

#### `GET /sensors/stats`
Aggregate statistics across all sensors. A sensor is considered **online** if it sent a keepalive in the last 5 minutes.

**Response `200`**
```json
{
  "total": 3,
  "online": 1,
  "offline": 2,
  "with_anomaly": 0,
  "by_district": {
    "Lisboa": 2,
    "Faro": 1
  }
}
```

---

#### `GET /sensors/{id}`
Get a single sensor by ID.

**Response `200`** — `Sensor`
**Response `404`** — sensor not found

---

#### `PATCH /sensors/{id}`
Update a sensor's `name` and/or `district`. Only provided fields are changed.

**Request body** (all fields optional)
```json
{
  "name": "New Name",
  "district": "Porto"
}
```

**Response `200`** — updated `Sensor`
**Response `400`** — empty name or district
**Response `404`** — sensor not found

---

#### `DELETE /sensors/{id}`
Delete a sensor permanently.

**Response `204`** — deleted
**Response `404`** — sensor not found

---

### Firmware

#### `POST /firmwares`
Upload a firmware binary. Must use `multipart/form-data`.

| Field | Type | Description |
|---|---|---|
| `file` | binary | The firmware `.bin` file |
| `version` | string | Version label, e.g. `v2.1.0` |

**Response `201`** — no body (firmware stored)
**Response `400`** — missing file or version
**Response `409`** — version already exists

---

#### `GET /firmwares`
List all uploaded firmware versions.

**Response `200`** — array of `Firmware`

---

#### `GET /firmwares/download/{id}`
Download a firmware binary file.

**Response `200`** — binary file stream (`application/octet-stream`)
**Response `404`** — firmware not found

---

### Actions

Actions are operator commands sent to a sensor. All actions take effect immediately in the database. Commands that require device-side execution (`REBOOT`) are delivered on the next keepalive call.

#### `POST /sensors/{id}/actions/update-firmware`
Stage a firmware update. Sets `firmware_update_pending` to `true`. The firmware is applied when the sensor next reboots — call `reboot` to schedule that.

**Request body**
```json
{ "firmware_id": "95e0d152-b5a0-43e3-b888-7e71dfb4059a" }
```

**Response `200`** — updated `Sensor` (note: `firmware_update_pending` is now `true`)
**Response `404`** — sensor or firmware not found

---

#### `POST /sensors/{id}/actions/reboot`
Schedule a reboot. Sets `pending_action` to `REBOOT`, delivered on the next keepalive. If a firmware update is staged, it will be applied during this reboot.

**Response `200`** — updated `Sensor`
**Response `404`** — sensor not found

---

#### `POST /sensors/{id}/actions/clear-anomaly`
Immediately clears the sensor's anomaly status to `NONE`. No device interaction required.

**Response `200`** — updated `Sensor`
**Response `404`** — sensor not found

---

### Device Integration

These endpoints are called by the physical sensor devices.

#### `POST /sensors/{id}/keepalive`
Signal that the sensor is alive. Updates `ultimo_keepalive` and returns any pending action. The action is delivered **once** — `pending_action` resets to `NONE` after this call.

**Response `200`** — `KeepAliveResponse`

No pending action:
```json
{ "action": "NONE" }
```

Reboot only:
```json
{ "action": "REBOOT" }
```

Reboot with staged firmware (device should download, flash, then reboot):
```json
{
  "action": "REBOOT",
  "target_firmware_id": "95e0d152-b5a0-43e3-b888-7e71dfb4059a",
  "download_link": "http://localhost:8084/firmwares/download/95e0d152-b5a0-43e3-b888-7e71dfb4059a"
}
```

**Response `404`** — sensor not found

---

#### `POST /sensors/{id}/anomalies`
Flag the sensor as having an anomaly. Sets `anomaly_status` to `DETECTED`. Called by the anomaly-service when it detects a problem — no body required.

**Response `200`** — updated `Sensor`
**Response `404`** — sensor not found

---

## Typical Flows

### Register a sensor and deploy firmware

```
POST /sensors                              → create sensor
POST /firmwares                            → upload firmware binary
POST /sensors/{id}/actions/update-firmware → stage the firmware
POST /sensors/{id}/actions/reboot          → schedule reboot to apply it
POST /sensors/{id}/keepalive               → device receives REBOOT + firmware info
                                             device flashes firmware and reboots
```

### Device keepalive loop (runs on the physical device)

```
POST /sensors/{id}/keepalive   → every N seconds
  → action == "REBOOT" + download_link:  download firmware, flash, reboot
  → action == "REBOOT" (no firmware):    reboot only
  → action == "NONE":                    nothing to do
```

### Anomaly lifecycle

```
POST /sensors/{id}/anomalies              → anomaly-service flags the sensor
                                             sensor.anomaly_status becomes DETECTED
POST /sensors/{id}/actions/clear-anomaly  → operator clears it after investigating
                                             sensor.anomaly_status returns to NONE
```

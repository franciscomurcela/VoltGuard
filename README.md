# VoltGuard

IoT energy monitoring platform developed for the EGS course. Monitors electrical sensors across Portuguese districts, detects anomalies via machine learning, and delivers real-time notifications.

## Architecture

All external traffic enters through the **Kong API Gateway** on port 80 and is routed by subdomain to the appropriate service.

```
Browser / Client
      │
      ▼ port 80
 Kong Gateway
      ├── composer.voltguard.pt       → Compositor Frontend (React SPA)
      ├── composer.voltguard.pt/api/* → Compositor Backend (Node.js API)
      ├── oam.voltguard.pt            → OAM Service (Rust)
      ├── notifications.voltguard.pt  → Notifications Service (Python)
      └── anomaly.voltguard.pt        → Anomaly Detection API (FastAPI)
```

Service-to-service communication uses Docker internal DNS and bypasses Kong entirely.

## Prerequisites

- Docker and Docker Compose
- `sudo` access (for the one-time hosts setup)

## Setup

### 1. Configure local DNS (one time per machine)

The subdomains need to resolve to `127.0.0.1` locally:

```bash
sudo bash scripts/add-hosts.sh
```

This idempotently adds the following entries to `/etc/hosts`:

```
127.0.0.1  composer.voltguard.pt
127.0.0.1  oam.voltguard.pt
127.0.0.1  notifications.voltguard.pt
127.0.0.1  anomaly.voltguard.pt
```

### 2. Configure environment

```bash
cp env.example .env
# Edit .env and fill in any required secrets
```

### 3. Start the stack

```bash
docker compose up --build
```

On first run Docker builds all images — this takes a few minutes. Subsequent starts are faster:

```bash
docker compose up
```

To stop:

```bash
docker compose down
```

### 4. Seed Secrets (Vault)
Since Vault runs in -dev mode (in-memory), you must inject the secrets from your .env every time the container is recreated:

Windows (PowerShell):
```bash
./scripts/vault/seed_vault.ps1
```

Linux/macOS (Bash):
```bash
chmod +x seed_vault.sh
./scripts/vault/seed_vault.sh
```

### 5. Start/Restart Application Services
After seeding, restart the services so they can pull the new secrets from the "Vault":

```bash
docker compose restart compositor-backend notifications-service anomaly-api
```

## Secrets Management (Vault)
To ensure high security, services do not read sensitive data directly from the .env file in production. Instead, they use a Secrets Loader pattern:

Node.js (Backend): Uses vault.js to populate process.env.

Python (Notifications/Anomaly): Uses vault_loader.py to populate os.environ.



## Service URLs

All services are available through Kong on port 80 after setup.

| Service | URL | Description |
|---|---|---|
| **Frontend** | http://composer.voltguard.pt | Main dashboard (React SPA) |
| **Composer API** | http://composer.voltguard.pt/api | REST API + Swagger UI |
| **Composer Swagger** | http://composer.voltguard.pt/swagger-ui | Interactive API docs |
| **OAM Service** | http://oam.voltguard.pt | Sensor & firmware management |
| **OAM Swagger** | http://oam.voltguard.pt/swagger-ui | OAM interactive API docs |
| **Notifications** | http://notifications.voltguard.pt | Notification gateway |
| **Anomaly Detection** | http://anomaly.voltguard.pt | ML anomaly detection API |
| **Anomaly Docs** | http://anomaly.voltguard.pt/docs | FastAPI auto-generated docs |

### Kong Admin API

The Kong admin API is exposed on port 8001 for debugging and inspection:

```bash
# List all routes
curl http://localhost:8001/routes

# List all services
curl http://localhost:8001/services

# Check Kong status
curl http://localhost:8001/status
```

## Direct Port Access (debugging)

Services are also reachable directly by port, bypassing Kong:

| Service | Direct URL |
|---|---|
| Compositor Backend | http://localhost:8080 |
| Compositor Frontend | http://localhost:3000 |
| OAM Service | http://localhost:8084 |
| Notifications Service | http://localhost:8083 |
| Anomaly Detection | http://localhost:8085 |
| Keycloak | http://localhost:8081 |
| Kong Admin API | http://localhost:8001 |

## Sensor Simulator

Run the sensor simulator to populate the platform with data:

```bash
cd sensor-simulator/multipleSensors
pip install -r requirements.txt

# Fetch sensors from OAM and simulate readings
python simulator.py --generate-config

# Run with an existing sensors.json
python simulator.py
```

The simulator sends measurements to the anomaly detection service and triggers the full notification pipeline when anomalies are detected.

## Secrets Management (Vault)
To ensure high security, services do not read sensitive data directly from the .env file in production. Instead, they use a Secrets Loader pattern:

Node.js (Backend): Uses vault.js to populate process.env.

Python (Notifications/Anomaly): Uses vault_loader.py to populate os.environ.

Verification Tip: To ensure a service is truly using Vault, comment out the sensitive keys in your .env and restart the service. If it still works, it's successfully pulling from Vault.

## Troubleshooting Vault & Keycloak
404 Not Found (Backend): Vault was recreated and is empty. Re-run Step 4 (Seeding).

401 Unauthorized: Ensure the ANOMALY_APP_TOKEN in Vault matches the one used by the services.

Invalid parameter: redirect_uri: If this occurs on page refresh (F5), ensure the Keycloak Client has [https://composer.voltguard.pt/](https://composer.voltguard.pt/)* (with wildcard) in Valid Redirect URIs.

## Services Overview

| Service | Stack | Responsibility |
|---|---|---|
| `composer-service/frontend` | React + Vite | Dashboard UI |
| `composer-service/backend` | Node.js / Express | SOA gateway — aggregates and normalises data from all peer services |
| `oam-service` | Rust / Axum | Sensor inventory, firmware management, keepalive handling |
| `notifications-service` | Python / Connexion | Multi-channel notifications (email, SMS, WhatsApp) via Twilio |
| `anomaly-detection` | Python / FastAPI | ML-based anomaly detection using Prophet and PyOD |
| `kong` | Kong 3.7 (DB-less) | API gateway — subdomain routing on port 80 |
| `keycloak` | Keycloak 25 | Authentication (currently disabled via `AUTH_DISABLED=true`) |

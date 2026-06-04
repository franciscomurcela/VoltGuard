# VoltGuard

IoT energy monitoring platform developed for the EGS course. Monitors electrical sensors across Portuguese districts, detects anomalies via machine learning, and delivers real-time notifications.

## Project Structure

```
VoltGuard/
├── composer-service/
│   ├── backend/            Node.js / Express SOA gateway
│   ├── frontend/           React + Vite SPA (dashboard)
│   ├── infra/keycloak/     Keycloak realm configuration
│   └── mock-peers/         Mock peer services for local dev
├── oam-service/            Rust / Axum sensor management service
├── anomaly-detection/      Python / FastAPI ML anomaly detection
├── notifications-service/  Python / Connexion alerting gateway
├── sensor-simulator/       Synthetic sensor data generator
├── k8s/
│   ├── deployment.yaml     All production Kubernetes workloads
│   ├── observability.yaml  Prometheus + Grafana stack
│   ├── secrets.yaml.example  Template — copy and fill before deploying
│   └── secrets.yaml        (gitignored — never committed)
├── kong/
│   └── kong.yml            DB-less gateway declarative config
├── infra/observability/    Local Prometheus + Grafana config (docker-compose)
├── docs/
│   ├── report.tex          LaTeX source for the project report
│   ├── Diagram.png         High-level architecture diagram
│   └── *.png               Screenshots used in the report
├── scripts/vault/          Vault secret seeding scripts
├── docker-compose.yaml     Local development stack
├── env.example             Environment variable template
└── Makefile
```

---

## Architecture

```
Browser / Client
      │
      ▼ HTTPS  (University Ingress Controller → Kong)
 Kong API Gateway  ──  2 replicas, HPA (min 2 / max 5)
      │
      ├──  /            →  Compositor Frontend   (React SPA, HPA min 2 / max 5)
      ├──  /api/*       →  Compositor Backend    (Node.js / Express)
      ├──  /auth/*      →  Keycloak 25           (OIDC / PKCE authentication)
      ├──  /oam/*       →  OAM Service           (Rust / Axum)
      ├──  /notify/*    →  Notifications Service (Python / Connexion)
      └──  /anomaly/*   →  Anomaly Detection     (Python / FastAPI)
```

Service-to-service calls use internal Kubernetes DNS and bypass Kong entirely.

---

## Production (Kubernetes)

The live deployment runs on the university cluster at **`https://grupo4-egs-deti.ua.pt/`**.

### Prerequisites

- `kubectl` configured with access to the cluster namespace `tenant-grupo4-egs-deti-ua-pt`
- Access to `registry.deti` (university private registry)

### Deploy

**1. Apply secrets**

```bash
# Copy the example and fill in all values
cp k8s/secrets.yaml.example k8s/secrets.yaml
# Edit k8s/secrets.yaml with real credentials (file is gitignored)
kubectl apply -f k8s/secrets.yaml
```

**2. Deploy all services**

```bash
kubectl apply -f k8s/deployment.yaml
```

**3. Deploy observability stack (optional)**

```bash
kubectl apply -f k8s/observability.yaml
```

**4. Verify pods are running**

```bash
kubectl get pods -n tenant-grupo4-egs-deti-ua-pt
```

### Rebuild and push an image

```bash
# Example: frontend
docker build \
  --build-arg VITE_AUTH_DISABLED=false \
  --build-arg VITE_KEYCLOAK_URL=https://grupo4-egs-deti.ua.pt/auth \
  -t registry.deti/grupo4-egs-deti.ua.pt/compositor-frontend:v5 \
  composer-service/frontend/

docker push registry.deti/grupo4-egs-deti.ua.pt/compositor-frontend:v5

# Force pods to pull the new image (when tag hasn't changed)
kubectl rollout restart deployment/grupo4-compositor-frontend -n tenant-grupo4-egs-deti-ua-pt
```

### Production URLs

| Service | URL |
|---|---|
| **Frontend** | https://grupo4-egs-deti.ua.pt/ |
| **Keycloak** | https://grupo4-egs-deti.ua.pt/auth |
| **Grafana** | https://grupo4-egs-deti.ua.pt/grafana |

---

## Observability

The observability stack (deployed via `k8s/observability.yaml`) consists of:

- **Prometheus** — scrapes metrics from all services every 15 s
- **Grafana** — dashboards pre-provisioned at `/grafana`

Scraped targets:

| Target | Metrics path |
|---|---|
| Anomaly Detection | `/metrics` |
| Compositor Backend | `/metrics` |
| Notifications Service | `/metrics` |
| OAM Service | `/metrics` |

---

## Load Balancing & Auto-scaling

Kong and the Frontend are each managed by a **HorizontalPodAutoscaler**:

| Component | Min replicas | Max replicas | Trigger |
|---|---|---|---|
| Kong Gateway | 2 | 5 | CPU utilisation |
| Compositor Frontend | 2 | 5 | CPU utilisation |

To watch scaling events live:

```bash
kubectl get hpa -n tenant-grupo4-egs-deti-ua-pt --watch
kubectl get events -n tenant-grupo4-egs-deti-ua-pt --watch | grep -i hpa
```

Stress-test the cluster from your local machine:

```bash
ab -n 100000 -c 200 http://grupo4-egs-deti.ua.pt/
```

---

## Local Development (Docker Compose)

### Prerequisites

- Docker and Docker Compose
- `sudo` access (one-time hosts setup)

### 1. Configure local DNS

```bash
sudo bash scripts/add-hosts.sh
```

This idempotently adds to `/etc/hosts`:

```
127.0.0.1  composer.voltguard.pt
127.0.0.1  oam.voltguard.pt
127.0.0.1  notifications.voltguard.pt
127.0.0.1  anomaly.voltguard.pt
```

### 2. Configure environment

```bash
cp env.example .env
# Fill in required secrets
```

### 3. Start the stack

```bash
docker compose up --build
```

Subsequent starts (no rebuild):

```bash
docker compose up
```

### 4. Seed Vault secrets

Vault runs in dev mode (in-memory) and must be seeded every time it is recreated:

```bash
# Linux / macOS
chmod +x scripts/vault/seed_vault.sh
./scripts/vault/seed_vault.sh

# Windows (PowerShell)
./scripts/vault/seed_vault.ps1
```

### 5. Restart application services

After seeding, restart services so they read the new secrets from Vault:

```bash
docker compose restart compositor-backend notifications-service anomaly-api
```

### Local service URLs

All services are available through Kong on port 80 after setup.

| Service | URL |
|---|---|
| **Frontend** | http://composer.voltguard.pt |
| **Composer API** | http://composer.voltguard.pt/api |
| **OAM Service** | http://oam.voltguard.pt |
| **Notifications** | http://notifications.voltguard.pt |
| **Anomaly Detection** | http://anomaly.voltguard.pt |
| **Kong Admin** | http://localhost:8001 |

### Direct port access (debugging)

| Service | URL |
|---|---|
| Compositor Backend | http://localhost:8080 |
| Compositor Frontend | http://localhost:3000 |
| OAM Service | http://localhost:8084 |
| Notifications Service | http://localhost:8083 |
| Anomaly Detection | http://localhost:8085 |
| Keycloak | http://localhost:8081 |
| Kong Admin API | http://localhost:8001 |

---

## Sensor Simulator

Populates the platform with synthetic sensor data:

```bash
cd sensor-simulator/multipleSensors
pip install -r requirements.txt

# Auto-fetch sensor list from OAM and generate config
python simulator.py --generate-config

# Run with an existing sensors.json
python simulator.py
```

The simulator sends measurements to the anomaly detection service and triggers the full notification pipeline when anomalies are detected.

---

## Services Overview

| Service | Stack | Responsibility |
|---|---|---|
| `composer-service/frontend` | React + Vite | Dashboard UI |
| `composer-service/backend` | Node.js / Express | SOA gateway — aggregates and normalises data from peer services |
| `oam-service` | Rust / Axum | Sensor inventory, firmware management, keepalive handling |
| `notifications-service` | Python / Connexion | Multi-channel notifications (email, SMS, WhatsApp) via Twilio |
| `anomaly-detection` | Python / FastAPI | ML-based anomaly detection using Prophet and PyOD |
| `kong` | Kong 3.7 (DB-less) | API gateway — routing + load balancing |
| `keycloak` | Keycloak 25 | OIDC authentication with PKCE (enabled in production) |

---

## Secrets Management

Services never read secrets directly from `.env` in production. They use a Vault-backed secrets loader:

- **Node.js** (Compositor Backend): `vault.js` populates `process.env`
- **Python** (Notifications / Anomaly): `vault_loader.py` populates `os.environ`

In Kubernetes, secrets are injected via `k8s/secrets.yaml` (gitignored — copy from `secrets.yaml.example`).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| 404 from backend | Vault was recreated and is empty | Re-run Step 4 (seed Vault) |
| 401 Unauthorized | Token mismatch | Ensure `ANOMALY_APP_TOKEN` in Vault matches the value used by services |
| Keycloak redirect error on F5 | Missing wildcard in redirect URIs | Add `https://grupo4-egs-deti.ua.pt/*` to Valid Redirect URIs in Keycloak client config |
| Frontend not updating after push | Old image cached in pod | Run `kubectl rollout restart deployment/<name>` |
| HPA not scaling | Metrics server not available or CPU requests not set | Check `kubectl describe hpa -n tenant-grupo4-egs-deti-ua-pt` |

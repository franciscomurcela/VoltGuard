#!/usr/bin/env python3
"""
VoltGuard Sensor Simulator
Simulates IoT sensors across Portuguese districts, sends periodic measurements
to the anomaly detection service, and triggers notifications when anomalies are found.

Usage:
  python simulator.py                                  # loads sensors.json
  python simulator.py --config my-sensors.json         # custom config
  python simulator.py --generate-config                # fetch from OAM → sensors.json
  python simulator.py --generate-config --sensors 30   # fetch + generate extras
  python simulator.py --help

Requirements:
  pip install httpx rich
"""

import argparse
import asyncio
import json
import random
import sys
import time
from datetime import datetime, timezone
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

try:
    import httpx
except ImportError:
    print("Missing dependency. Run: pip install httpx rich")
    sys.exit(1)

try:
    from rich.console import Console
    from rich.table import Table
    HAS_RICH = True
except ImportError:
    HAS_RICH = False

# ─── Sensor Metric Profiles ─────────────────────────────────────────────────
SENSOR_PROFILES = {
    "voltage":      {"unit": "V",  "baseline": 230.0, "noise": 5.0,   "anomaly_spike": 80.0},
    "current":      {"unit": "A",  "baseline": 50.0,  "noise": 8.0,   "anomaly_spike": 60.0},
    "power_factor": {"unit": "",   "baseline": 0.95,  "noise": 0.03,  "anomaly_spike": -0.4},
    "frequency":    {"unit": "Hz", "baseline": 50.0,  "noise": 0.2,   "anomaly_spike": 3.0},
    "temperature":  {"unit": "°C", "baseline": 35.0,  "noise": 3.0,   "anomaly_spike": 30.0},
    "power_draw":   {"unit": "W",  "baseline": 250.0, "noise": 30.0,  "anomaly_spike": 200.0},
}

ANOMALY_PATTERNS = [
    {"name": "voltage_spike",    "metrics": ["voltage"],                "description": "Sudden voltage surge"},
    {"name": "current_overload", "metrics": ["current", "temperature"], "description": "Current overload with heat"},
    {"name": "frequency_drift",  "metrics": ["frequency"],              "description": "Grid frequency deviation"},
    {"name": "power_factor_drop","metrics": ["power_factor", "power_draw"], "description": "Efficiency collapse"},
    {"name": "thermal_runaway",  "metrics": ["temperature", "current"], "description": "Temperature escalation"},
]

DISTRICTS = [
    "Lisboa", "Porto", "Aveiro", "Coimbra", "Faro", "Braga", "Setúbal",
    "Évora", "Viseu", "Guarda", "Bragança", "Vila Real", "Viana do Castelo",
    "Leiria", "Santarém", "Castelo Branco", "Portalegre", "Beja",
]

ALL_METRICS = list(SENSOR_PROFILES.keys())


@dataclass
class Sensor:
    """Represents a simulated IoT sensor."""
    sensor_id: str
    name: str
    district: str
    metrics: list = field(default_factory=list)
    readings_sent: int = 0
    anomalies_injected: int = 0
    last_reading: Optional[dict] = None
    is_anomalous: bool = False

    def generate_reading(self, inject_anomaly: bool = False) -> tuple:
        """Generate a realistic sensor reading, optionally with anomaly."""
        timestamp = datetime.now(timezone.utc).isoformat()
        values = {}
        pattern = random.choice(ANOMALY_PATTERNS) if inject_anomaly else None

        for metric_name in self.metrics:
            profile = SENSOR_PROFILES[metric_name]
            base = profile["baseline"]
            noise = profile["noise"]

            value = base + random.gauss(0, noise)

            if inject_anomaly and pattern and metric_name in pattern["metrics"]:
                spike = profile["anomaly_spike"]
                value = base + spike + random.gauss(0, abs(noise) * 2) if spike > 0 else base + spike + random.gauss(0, abs(noise))

            values[metric_name] = round(value, 3)

        reading = {
            "source_id": self.sensor_id,
            "timestamp": timestamp,
            "metrics": values,
            "context": {
                "hour": datetime.now().hour,
                "day_of_week": datetime.now().weekday(),
                "location": self.district,
            },
        }

        self.last_reading = reading
        self.readings_sent += 1
        self.is_anomalous = inject_anomaly
        if inject_anomaly:
            self.anomalies_injected += 1

        return reading, pattern


# ─── Config Loading ──────────────────────────────────────────────────────────

def load_sensors_from_config(config_path: str) -> list:
    """Load sensors from a JSON config file."""
    path = Path(config_path)
    if not path.exists():
        print(f"Config file not found: {config_path}")
        print("Run 'python simulator.py --generate-config' to create one from OAM.")
        sys.exit(1)

    with open(path) as f:
        data = json.load(f)

    sensors_data = data.get("sensors", [])
    if not sensors_data:
        print(f"No sensors found in {config_path}")
        sys.exit(1)

    sensors = []
    for s in sensors_data:
        # Assign random metrics if not specified in config
        metrics = s.get("metrics")
        if not metrics:
            metrics = random.sample(ALL_METRICS, random.randint(2, 4))

        sensor = Sensor(
            sensor_id=s["id"],
            name=s.get("name", s["id"]),
            district=s.get("district", random.choice(DISTRICTS)),
            metrics=metrics,
        )
        sensors.append(sensor)

    return sensors


def generate_config_from_oam(oam_url: str, output_path: str, extra_count: int = 0):
    """Fetch sensors from OAM and write a config file."""
    console = Console() if HAS_RICH else None

    def log(msg):
        if console:
            console.print(msg)
        else:
            print(msg)

    log(f"[bold]Fetching sensors from OAM: {oam_url}/sensors[/bold]")

    try:
        response = httpx.get(f"{oam_url}/sensors", timeout=10.0)
        response.raise_for_status()
        oam_sensors = response.json()
    except Exception as e:
        log(f"[red]Failed to fetch from OAM: {e}[/red]")
        sys.exit(1)

    # Handle both array and wrapped response
    if isinstance(oam_sensors, dict):
        oam_sensors = oam_sensors.get("sensors", oam_sensors.get("data", []))

    sensors = []
    for s in oam_sensors:
        sensor_entry = {
            "id": s.get("id"),
            "name": s.get("name", "Unknown"),
            "district": s.get("district", "Lisboa"),
            "metrics": random.sample(ALL_METRICS, random.randint(2, 4)),
        }
        sensors.append(sensor_entry)

    log(f"[green]✓ Found {len(sensors)} sensors in OAM[/green]")

    # Generate extra synthetic sensors if requested
    if extra_count > 0:
        log(f"[cyan]Generating {extra_count} additional synthetic sensors...[/cyan]")
        import uuid
        for i in range(extra_count):
            district = DISTRICTS[i % len(DISTRICTS)]
            sensors.append({
                "id": str(uuid.uuid4()),
                "name": f"Synthetic Sensor {district} {i+1}",
                "district": district,
                "metrics": random.sample(ALL_METRICS, random.randint(2, 4)),
            })

    config = {
        "_generated_at": datetime.now(timezone.utc).isoformat(),
        "_source": oam_url,
        "_total": len(sensors),
        "sensors": sensors,
    }

    path = Path(output_path)
    with open(path, "w") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

    log(f"[bold green]✓ Config written to {path} ({len(sensors)} sensors)[/bold green]")

    # Show what was saved
    if console and HAS_RICH:
        table = Table(title="Sensors in Config", border_style="dim")
        table.add_column("ID", style="cyan", max_width=12)
        table.add_column("Name")
        table.add_column("District")
        table.add_column("Metrics", style="dim")

        for s in sensors[:20]:
            short_id = s["id"][:8] + "..."
            table.add_row(short_id, s["name"], s["district"], ", ".join(s["metrics"]))
        if len(sensors) > 20:
            table.add_row("...", f"(+{len(sensors) - 20} more)", "", "")
        console.print(table)


# ─── Simulator ───────────────────────────────────────────────────────────────

class Simulator:
    def __init__(self, args, sensors):
        self.args = args
        self.sensors = sensors
        self.anomaly_client = httpx.AsyncClient(
            base_url=args.anomaly_url,
            timeout=10.0,
            headers={"X-App-Token": args.anomaly_token},
        )
        self.notification_client = httpx.AsyncClient(
            base_url=args.notification_url,
            timeout=10.0,
        )
        self.console = Console() if HAS_RICH else None

        # Stats
        self.total_readings = 0
        self.total_anomalies_injected = 0
        self.total_anomalies_detected = 0
        self.total_notifications_sent = 0
        self.total_errors = 0
        self.start_time = time.time()

    def log(self, msg: str):
        ts = datetime.now().strftime("%H:%M:%S")
        if self.console:
            self.console.print(f"[dim]{ts}[/dim] {msg}")
        else:
            # Strip rich tags for plain output
            import re
            clean = re.sub(r'\[/?[^\]]+\]', '', msg)
            print(f"{ts} {clean}")

    async def send_measurements(self, batch: list) -> Optional[str]:
        try:
            response = await self.anomaly_client.post("/v1/measurements", json={"data": batch})
            if response.status_code == 202:
                return response.json().get("measurement_id")
            else:
                self.log(f"[red]✗ Anomaly API returned {response.status_code}[/red]")
                self.total_errors += 1
                return None
        except Exception as e:
            self.log(f"[red]✗ Anomaly API error: {e}[/red]")
            self.total_errors += 1
            return None

    async def check_measurement_status(self, measurement_id: str) -> Optional[dict]:
        try:
            for _ in range(self.args.poll_retries):
                await asyncio.sleep(self.args.poll_delay)
                response = await self.anomaly_client.get(f"/v1/measurements/{measurement_id}")
                if response.status_code == 200:
                    data = response.json()
                    if data.get("status") == "analyzed":
                        return data
                elif response.status_code == 404:
                    return None
            return None
        except Exception as e:
            self.log(f"[yellow]⚠ Poll error: {e}[/yellow]")
            return None

    async def send_notification(self, sensor: Sensor, pattern: dict):
        try:
            payload = {
                "client_id": "energy_composer",
                "channel": "twilio_sms",
                "target": self.args.notification_target,
                "message_template": (
                    f"🚨 VoltGuard Alert: {pattern['description']} on "
                    f"sensor {{sensor_id}} ({{sensor_name}}) in {{district}}. "
                    f"Metrics: {{metrics}}."
                ),
                "variables": {
                    "sensor_id": sensor.sensor_id[:8],
                    "sensor_name": sensor.name,
                    "district": sensor.district,
                    "metrics": ", ".join(pattern["metrics"]),
                },
            }
            response = await self.notification_client.post(
                f"/v1/notifications?auth_token={self.args.notification_token}",
                json=payload,
            )
            if response.status_code == 201:
                self.total_notifications_sent += 1
                status = response.json().get("status", "unknown")
                self.log(
                    f"[magenta]📨 Notification[/magenta] → {sensor.name} ({sensor.district}) | "
                    f"status={status} | {pattern['description']}"
                )
            else:
                self.log(f"[yellow]⚠ Notification API: {response.status_code}[/yellow]")
        except Exception as e:
            self.log(f"[yellow]⚠ Notification error: {e}[/yellow]")

    async def run_cycle(self, cycle: int):
        batch = []
        anomalous_sensors = []

        for sensor in self.sensors:
            inject = random.random() < self.args.anomaly_chance
            reading, pattern = sensor.generate_reading(inject_anomaly=inject)
            batch.append(reading)
            self.total_readings += 1

            if inject:
                self.total_anomalies_injected += 1
                anomalous_sensors.append((sensor, pattern))

        # Send in chunks
        measurement_ids = []
        for i in range(0, len(batch), self.args.batch_size):
            chunk = batch[i:i + self.args.batch_size]
            mid = await self.send_measurements(chunk)
            if mid:
                measurement_ids.append(mid)

        anomaly_count = len(anomalous_sensors)
        districts_hit = set(s.district for s, _ in anomalous_sensors)
        district_str = f" in {', '.join(districts_hit)}" if districts_hit else ""

        color = "red" if anomaly_count else "dim"
        self.log(
            f"[green]▶ Cycle {cycle}[/green] | "
            f"{len(batch)} readings · {len(measurement_ids)} batches | "
            f"[{color}]{anomaly_count} anomalies{district_str}[/{color}]"
        )

        # Poll results
        for mid in measurement_ids:
            result = await self.check_measurement_status(mid)
            if result and result.get("anomalies_detected"):
                self.total_anomalies_detected += 1
                self.log(f"[red]🔴 Anomaly confirmed[/red] → {mid}")

        # Notifications
        if anomalous_sensors and self.args.notify:
            for sensor, pattern in anomalous_sensors:
                await self.send_notification(sensor, pattern)

    def print_stats(self):
        elapsed = time.time() - self.start_time
        rps = self.total_readings / elapsed if elapsed > 0 else 0

        if self.console and HAS_RICH:
            table = Table(title="Simulator Stats", show_header=False, border_style="dim")
            table.add_column("Metric", style="dim")
            table.add_column("Value", style="bold")
            table.add_row("Sensors", str(len(self.sensors)))
            table.add_row("Total Readings", f"{self.total_readings:,}")
            table.add_row("Readings/sec", f"{rps:.1f}")
            table.add_row("Anomalies Injected", f"[yellow]{self.total_anomalies_injected}[/yellow]")
            table.add_row("Anomalies Detected", f"[red]{self.total_anomalies_detected}[/red]")
            table.add_row("Notifications Sent", f"[magenta]{self.total_notifications_sent}[/magenta]")
            table.add_row("Errors", f"[red]{self.total_errors}[/red]" if self.total_errors else "0")
            table.add_row("Uptime", f"{elapsed:.0f}s")
            self.console.print(table)
        else:
            print(f"\n--- Stats ---")
            print(f"Sensors: {len(self.sensors)} | Readings: {self.total_readings:,} ({rps:.1f}/s)")
            print(f"Anomalies: {self.total_anomalies_injected} injected, {self.total_anomalies_detected} detected")
            print(f"Notifications: {self.total_notifications_sent} | Errors: {self.total_errors}")
            print(f"Uptime: {elapsed:.0f}s\n")

    def print_fleet(self):
        if self.console and HAS_RICH:
            table = Table(title=f"Sensor Fleet ({len(self.sensors)} sensors)", border_style="dim")
            table.add_column("ID", style="cyan", max_width=12)
            table.add_column("Name")
            table.add_column("District")
            table.add_column("Metrics", style="dim")

            for s in self.sensors[:20]:
                short_id = s.sensor_id[:8] + "..."
                table.add_row(short_id, s.name, s.district, ", ".join(s.metrics))
            if len(self.sensors) > 20:
                table.add_row("...", f"(+{len(self.sensors) - 20} more)", "", "")
            self.console.print(table)
        else:
            print(f"\n--- Fleet ({len(self.sensors)} sensors) ---")
            for s in self.sensors[:10]:
                print(f"  {s.sensor_id[:8]}... | {s.name} | {s.district} | {', '.join(s.metrics)}")
            if len(self.sensors) > 10:
                print(f"  ... (+{len(self.sensors) - 10} more)")

    async def run(self):
        self.log(f"[bold green]🚀 VoltGuard Sensor Simulator[/bold green]")
        self.log(
            f"   Anomaly:       {self.args.anomaly_url}\n"
            f"   Notification:  {self.args.notification_url}\n"
            f"   Sensors: {len(self.sensors)} | "
            f"Interval: {self.args.interval}s | "
            f"Anomaly chance: {self.args.anomaly_chance * 100:.0f}% | "
            f"Notify: {'ON' if self.args.notify else 'OFF'}"
        )
        self.print_fleet()

        cycle = 0
        try:
            while True:
                cycle += 1
                await self.run_cycle(cycle)
                if cycle % self.args.stats_every == 0:
                    self.print_stats()
                await asyncio.sleep(self.args.interval)
        except KeyboardInterrupt:
            self.log("[bold yellow]\n⏹ Stopped[/bold yellow]")
        finally:
            self.print_stats()
            await self.anomaly_client.aclose()
            await self.notification_client.aclose()


# ─── CLI ─────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description="VoltGuard Sensor Simulator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate config from OAM (run once)
  python simulator.py --generate-config
  python simulator.py --generate-config --extra-sensors 20

  # Run with config
  python simulator.py                                    # uses sensors.json
  python simulator.py --config my-fleet.json             # custom file
  python simulator.py --interval 5 --anomaly-chance 0.2  # faster + more anomalies
  python simulator.py --notify                           # enable notifications
        """,
    )

    # Config
    parser.add_argument("--config", type=str, default="sensors.json", help="Path to sensors config file (default: sensors.json)")
    parser.add_argument("--generate-config", action="store_true", help="Fetch sensors from OAM and write config file, then exit")
    parser.add_argument("--extra-sensors", type=int, default=0, help="Extra synthetic sensors to add when generating config")

    # Timing
    parser.add_argument("--interval", type=float, default=10.0, help="Seconds between cycles (default: 10)")
    parser.add_argument("--batch-size", type=int, default=100, help="Max measurements per API call (default: 100)")

    # Anomalies
    parser.add_argument("--anomaly-chance", type=float, default=0.1, help="Anomaly probability per sensor per cycle, 0.0-1.0 (default: 0.1)")

    # Services
    parser.add_argument("--oam-url", type=str, default="http://localhost:8084", help="OAM service URL (default: http://localhost:8084)")
    parser.add_argument("--anomaly-url", type=str, default="http://localhost:8085", help="Anomaly service URL (default: http://localhost:8085)")
    parser.add_argument("--anomaly-token", type=str, default="token_do_composer_123", help="X-App-Token for anomaly service")
    parser.add_argument("--notification-url", type=str, default="http://localhost:8083", help="Notification service URL")
    parser.add_argument("--notification-token", type=str, default="your_secure_auth_token", help="Auth token for notification service")
    parser.add_argument("--notification-target", type=str, default="+351912345678", help="Phone/email for notifications")

    # Notifications
    parser.add_argument("--notify", action="store_true", default=False, help="Enable notifications on anomaly")

    # Polling
    parser.add_argument("--poll-retries", type=int, default=5, help="Poll retries for results (default: 5)")
    parser.add_argument("--poll-delay", type=float, default=2.0, help="Seconds between polls (default: 2.0)")

    # Display
    parser.add_argument("--stats-every", type=int, default=5, help="Print stats every N cycles (default: 5)")

    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()

    # Generate config mode
    if args.generate_config:
        generate_config_from_oam(
            oam_url=args.oam_url,
            output_path=args.config,
            extra_count=args.extra_sensors,
        )
        sys.exit(0)

    # Normal mode — load config and run
    sensors = load_sensors_from_config(args.config)
    simulator = Simulator(args, sensors)
    asyncio.run(simulator.run())

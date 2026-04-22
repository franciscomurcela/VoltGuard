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
import re
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

    def generate_reading(self, inject_anomaly: bool = False, pattern: Optional[dict] = None, intensity: float = 1.0) -> tuple:
        """Generate a realistic sensor reading, optionally with anomaly.

        When inject_anomaly=True and pattern is provided, force that specific pattern
        (used by deterministic demo scheduler). Otherwise pick a random one. The intensity
        multiplier scales the spike magnitude — values above 1.0 push the reading further
        outside Prophet's confidence interval so detection is more reliable.
        """
        timestamp = datetime.now(timezone.utc).isoformat()
        values = {}
        if inject_anomaly and pattern is None:
            pattern = random.choice(ANOMALY_PATTERNS)
        elif not inject_anomaly:
            pattern = None

        for metric_name in self.metrics:
            profile = SENSOR_PROFILES[metric_name]
            base = profile["baseline"]
            noise = profile["noise"]

            value = base + random.gauss(0, noise)

            if inject_anomaly and pattern and metric_name in pattern["metrics"]:
                spike = profile["anomaly_spike"] * intensity
                extra_noise = random.gauss(0, abs(noise) * (2 if intensity >= 1.0 else 1))
                value = base + spike + extra_noise

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
        self.oam_client = httpx.AsyncClient(
            base_url=args.oam_url,
            timeout=10.0,
        )
        self.console = Console() if HAS_RICH else None

        # Buffer: {sensor_id: {metric_name: [{timestamp, value}]}}
        # Accumulates points until MIN_DATASET_POINTS is reached before submitting
        self._buffer: dict = {}

        # Deterministic injection scheduler (active when args.inject_every is set).
        # cycles_since_last_inject counts cycles since the last injection *started*;
        # pending_injection tracks an in-flight injection that spans --anomaly-window cycles
        # so the spike lands on the last N points of the 8-point flush buffer.
        self._cycles_since_last_inject: int = 0
        self._pending_injection: Optional[dict] = None
        self._pattern_cursor: int = 0
        self._target_cursor: int = 0
        # Sensor ids submitted with injected anomalies — used by post-flush poll
        self._injected_measurements: set = set()

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

    MIN_DATASET_POINTS = 8  # anomaly service requires ≥6; use 8 for a clean train/forecast split

    def _buffer_point(self, source_id: str, metric_name: str, timestamp: str, value: float):
        self._buffer.setdefault(source_id, {}).setdefault(metric_name, []).append(
            {"timestamp": timestamp, "value": value}
        )

    async def _flush_ready(self, injected_sensor_ids: Optional[set] = None) -> list:
        """Submit all sensor/metric series that have reached MIN_DATASET_POINTS. Returns measurement IDs.

        injected_sensor_ids: sensors that produced anomalous points this cycle; when one of their
        series flushes, the returned measurement_id is remembered so the post-flush detection poll
        can attribute it to an injection.
        """
        injected = injected_sensor_ids or set()
        ids = []
        for source_id, metrics in list(self._buffer.items()):
            for metric_name, points in list(metrics.items()):
                if len(points) < self.MIN_DATASET_POINTS:
                    continue
                mid = await self._submit_dataset(source_id, metric_name, points)
                if mid:
                    ids.append(mid)
                    if source_id in injected:
                        self._injected_measurements.add(mid)
                # Reset buffer for this series after submission
                self._buffer[source_id][metric_name] = []
        return ids

    async def _confirm_detections(self, measurement_ids: list):
        """Poll each measurement once to check how many anomalies the service reported. Runs in background."""
        for mid in measurement_ids:
            data = await self.check_measurement_status(mid)
            if not data:
                continue
            status = str(data.get("status", ""))
            # Status format from anomaly service: "analyzed (N anomalias)" — extract N
            match = re.search(r"\((\d+)\s+anomalias?\)", status)
            if match:
                self.total_anomalies_detected += int(match.group(1))

    async def _submit_dataset(self, source_id: str, metric_name: str, points: list) -> Optional[str]:
        try:
            payload = {"source_id": source_id, "metric_name": metric_name, "dataset": points}
            response = await self.anomaly_client.post("/v1/measurements", json=payload)
            if response.status_code == 202:
                return response.json().get("measurement_id")
            else:
                self.log(f"[red]✗ Anomaly API {response.status_code}: {response.text[:120]}[/red]")
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

    async def send_keepalive(self, sensor: Sensor):
        try:
            response = await self.oam_client.post(f"/sensors/{sensor.sensor_id}/keepalive")
            if response.status_code not in (200, 204):
                self.log(f"[yellow]⚠ Keepalive OAM {sensor.sensor_id[:8]}...: {response.status_code}[/yellow]")
        except Exception as e:
            self.log(f"[yellow]⚠ Keepalive error {sensor.sensor_id[:8]}...: {e}[/yellow]")

    def _pick_target_sensor(self) -> Optional[Sensor]:
        """Resolve --target-sensor (prefix match on uuid or name), else round-robin."""
        selector = self.args.target_sensor
        if selector:
            matches = [
                s for s in self.sensors
                if s.sensor_id.startswith(selector) or selector.lower() in s.name.lower()
            ]
            if not matches:
                self.log(f"[yellow]⚠ --target-sensor '{selector}' matched no sensors; falling back to round-robin[/yellow]")
            else:
                sensor = matches[self._target_cursor % len(matches)]
                self._target_cursor += 1
                return sensor
        if not self.sensors:
            return None
        sensor = self.sensors[self._target_cursor % len(self.sensors)]
        self._target_cursor += 1
        return sensor

    def _pick_pattern(self, sensor: Sensor) -> Optional[dict]:
        """Resolve --pattern, else round-robin through ANOMALY_PATTERNS. Patterns whose
        metrics don't overlap the sensor's metrics are skipped so the spike actually lands."""
        name = self.args.pattern
        if name:
            for p in ANOMALY_PATTERNS:
                if p["name"] == name:
                    return p
            self.log(f"[yellow]⚠ --pattern '{name}' not found; falling back to round-robin[/yellow]")

        compatible = [p for p in ANOMALY_PATTERNS if any(m in sensor.metrics for m in p["metrics"])]
        if not compatible:
            return None
        pattern = compatible[self._pattern_cursor % len(compatible)]
        self._pattern_cursor += 1
        return pattern

    def _maybe_schedule_injection(self):
        """Start a new injection when --inject-every cycles have passed and none is in flight."""
        if self._pending_injection is not None:
            return
        if not self.args.inject_every or self.args.inject_every <= 0:
            return
        if self._cycles_since_last_inject < self.args.inject_every:
            return

        sensor = self._pick_target_sensor()
        if sensor is None:
            return
        pattern = self._pick_pattern(sensor)
        if pattern is None:
            self.log(f"[yellow]⚠ No compatible pattern for sensor {sensor.name} (metrics={sensor.metrics})[/yellow]")
            return

        self._pending_injection = {
            "sensor_id": sensor.sensor_id,
            "sensor_name": sensor.name,
            "district": sensor.district,
            "pattern": pattern,
            "remaining_points": max(1, self.args.anomaly_window),
        }
        self._cycles_since_last_inject = 0

        short_id = sensor.sensor_id[:8]
        intensity = self.args.intensity
        window = self.args.anomaly_window
        self.log(
            f"[bold white on red]🔥 INJECTING {pattern['name']}[/bold white on red] on "
            f"[bold]{sensor.name}[/bold] ({short_id}...) in {sensor.district} | "
            f"intensity={intensity}x | window={window} pts"
        )
        self.log(f"   [dim]→ expect anomaly in composer UI within ~{window * self.args.interval + 5:.0f}s[/dim]")

    async def run_cycle(self, cycle: int):
        anomalous_sensors = []
        deterministic = bool(self.args.inject_every and self.args.inject_every > 0)

        if deterministic:
            self._cycles_since_last_inject += 1
            self._maybe_schedule_injection()
            cycles_to_next = max(0, self.args.inject_every - self._cycles_since_last_inject)
            next_hint = f" | next injection in {cycles_to_next} cycle{'s' if cycles_to_next != 1 else ''}" if self._pending_injection is None else " | injection in flight"
        else:
            next_hint = ""

        keepalive_tasks = []
        for sensor in self.sensors:
            if deterministic:
                inject = (
                    self._pending_injection is not None
                    and self._pending_injection["sensor_id"] == sensor.sensor_id
                )
                forced_pattern = self._pending_injection["pattern"] if inject else None
                intensity = self.args.intensity if inject else 1.0
            else:
                inject = random.random() < self.args.anomaly_chance
                forced_pattern = None
                intensity = 1.0

            reading, pattern = sensor.generate_reading(
                inject_anomaly=inject,
                pattern=forced_pattern,
                intensity=intensity,
            )
            self.total_readings += 1

            if inject:
                self.total_anomalies_injected += 1
                anomalous_sensors.append((sensor, pattern))

            keepalive_tasks.append(self.send_keepalive(sensor))

            # Buffer one point per metric
            ts = reading["timestamp"]
            for metric_name, value in reading["metrics"].items():
                self._buffer_point(sensor.sensor_id, metric_name, ts, value)

        # Decrement pending injection window AFTER all sensors processed this cycle
        if deterministic and self._pending_injection is not None:
            self._pending_injection["remaining_points"] -= 1
            if self._pending_injection["remaining_points"] <= 0:
                self._pending_injection = None

        # Send keepalives concurrently
        await asyncio.gather(*keepalive_tasks, return_exceptions=True)

        # Flush series that have accumulated enough points
        injected_sensor_ids = {s.sensor_id for s, _ in anomalous_sensors}
        measurement_ids = await self._flush_ready(injected_sensor_ids=injected_sensor_ids)

        anomaly_count = len(anomalous_sensors)
        districts_hit = set(s.district for s, _ in anomalous_sensors)
        district_str = f" in {', '.join(districts_hit)}" if districts_hit else ""

        color = "red" if anomaly_count else "dim"
        buffered = sum(len(pts) for metrics in self._buffer.values() for pts in metrics.values())
        self.log(
            f"[green]▶ Cycle {cycle}[/green]{next_hint} | "
            f"{len(self.sensors)} sensors · {len(measurement_ids)} datasets submitted · {buffered} pts buffered | "
            f"[{color}]{anomaly_count} anomalies{district_str}[/{color}]"
        )

        # Poll any measurement IDs flagged as injected to update detected count
        if self._injected_measurements:
            pending = list(self._injected_measurements)
            self._injected_measurements.clear()
            asyncio.create_task(self._confirm_detections(pending))

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
        if self.args.inject_every and self.args.inject_every > 0:
            mode_line = (
                f"Mode: [bold red]demo[/bold red] · "
                f"inject-every {self.args.inject_every} cycles · "
                f"intensity {self.args.intensity}x · window {self.args.anomaly_window} pts"
            )
            if self.args.target_sensor:
                mode_line += f" · target '{self.args.target_sensor}'"
            if self.args.pattern:
                mode_line += f" · pattern {self.args.pattern}"
        else:
            mode_line = f"Mode: random · anomaly chance {self.args.anomaly_chance * 100:.0f}%"

        self.log(
            f"   OAM:           {self.args.oam_url}\n"
            f"   Anomaly:       {self.args.anomaly_url}\n"
            f"   Notification:  {self.args.notification_url}\n"
            f"   Sensors: {len(self.sensors)} | Interval: {self.args.interval}s | Notify: {'ON' if self.args.notify else 'OFF'}\n"
            f"   {mode_line}"
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
            await self.oam_client.aclose()


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

  # Random load mode (default)
  python simulator.py                                    # uses sensors.json
  python simulator.py --config my-fleet.json             # custom file
  python simulator.py --interval 5 --anomaly-chance 0.2  # faster + more anomalies
  python simulator.py --notify                           # enable notifications

  # Demo mode — deterministic, presenter-friendly
  python simulator.py --demo-mode                                        # scheduled injections, fast cycles
  python simulator.py --demo-mode --target-sensor Lisboa                 # only injects on Lisboa sensors
  python simulator.py --demo-mode --pattern voltage_spike --intensity 3  # force a specific loud anomaly
  python simulator.py --inject-every 4 --intensity 2.0                   # manual demo tuning
        """,
    )

    # Config
    parser.add_argument("--config", type=str, default="sensors.json", help="Path to sensors config file (default: sensors.json)")
    parser.add_argument("--generate-config", action="store_true", help="Fetch sensors from OAM and write config file, then exit")
    parser.add_argument("--extra-sensors", type=int, default=0, help="Extra synthetic sensors to add when generating config")

    # Timing
    parser.add_argument("--interval", type=float, default=10.0, help="Seconds between cycles (default: 10)")
    parser.add_argument("--batch-size", type=int, default=100, help="Max measurements per API call (default: 100)")

    # Anomalies — random load mode
    parser.add_argument("--anomaly-chance", type=float, default=0.1, help="Random anomaly probability per sensor per cycle, 0.0-1.0 (default: 0.1). Ignored when --inject-every is set.")

    # Anomalies — deterministic demo mode
    parser.add_argument("--demo-mode", action="store_true", help="Presenter-friendly defaults: faster cycles, scheduled injections, higher intensity. See epilog.")
    parser.add_argument("--inject-every", type=int, default=0, help="Inject a guaranteed anomaly every N cycles (0 = disabled; use random --anomaly-chance instead)")
    parser.add_argument("--target-sensor", type=str, default=None, help="Restrict injection to sensors whose UUID starts with, or name contains, this string")
    parser.add_argument("--pattern", type=str, default=None, choices=[p["name"] for p in ANOMALY_PATTERNS], help="Force a specific anomaly pattern")
    parser.add_argument("--intensity", type=float, default=1.0, help="Multiplier for anomaly spike magnitude (default 1.0, demo default 2.0)")
    parser.add_argument("--anomaly-window", type=int, default=2, help="How many of the last buffered points carry the spike (default 2, hits Prophet's 80/20 validation split)")

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


def apply_demo_defaults(args, argv: list):
    """Override timing/injection defaults when --demo-mode is set, unless the user passed them explicitly.

    argv is the raw sys.argv list — checked so that user-provided flags always win over demo defaults.
    """
    def user_set(*flags):
        return any(any(a == f or a.startswith(f + "=") for a in argv) for f in flags)

    if not args.demo_mode:
        return

    if not user_set("--interval"):
        args.interval = 5.0
    if not user_set("--inject-every"):
        args.inject_every = 4
    if not user_set("--intensity"):
        args.intensity = 2.0
    if not user_set("--anomaly-window"):
        args.anomaly_window = 2
    if not user_set("--stats-every"):
        args.stats_every = 3


if __name__ == "__main__":
    args = parse_args()
    apply_demo_defaults(args, sys.argv)

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

#!/usr/bin/env python3
"""
VoltGuard Device Simulator
Simulates a sensor talking to the OAM service:
  - registers itself (or reuses a saved ID)
  - sends periodic keepalives
  - handles UPDATE_FIRMWARE  → downloads .bin, simulates flashing
  - handles REBOOT           → simulates restart
  - randomly reports anomalies (toggle with --anomalies)

Usage:
  python simulate_device.py                          # defaults
  python simulate_device.py --url http://oam:8080    # custom OAM URL
  python simulate_device.py --name "Sensor Lisboa 1" --district Lisboa
  python simulate_device.py --interval 10            # keepalive every 10s
  python simulate_device.py --anomalies              # enable random anomalies
  python simulate_device.py --id <uuid>              # reuse existing sensor ID
"""

import argparse
import json
import os
import random
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

import requests

# ─── ANSI colours ─────────────────────────────────────────────────────────────

RESET  = "\033[0m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
BLUE   = "\033[94m"
CYAN   = "\033[96m"
RED    = "\033[91m"
GRAY   = "\033[90m"

def ts() -> str:
    return datetime.now().strftime("%H:%M:%S")

def log(level: str, color: str, msg: str) -> None:
    print(f"{GRAY}{ts()}{RESET}  {color}{BOLD}{level:<12}{RESET} {msg}")

def info(msg):    log("INFO",     CYAN,   msg)
def ok(msg):      log("OK",       GREEN,  msg)
def warn(msg):    log("WARN",     YELLOW, msg)
def error(msg):   log("ERROR",    RED,    msg)
def action(msg):  log("ACTION",   BLUE,   msg)
def dim(msg):     log("···",      GRAY,   msg)

# ─── State file (persist sensor ID between runs) ──────────────────────────────

STATE_FILE = Path(".device_state.json")

def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {}

def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2))

# ─── OAM Client ───────────────────────────────────────────────────────────────

class OamClient:
    def __init__(self, base_url: str, timeout: int = 10):
        self.base = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

    def register(self, name: str, district: str) -> dict:
        """POST /sensors"""
        resp = self.session.post(
            f"{self.base}/sensors",
            json={"name": name, "district": district},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()

    def keepalive(self, sensor_id: str) -> dict:
        """POST /sensors/:id/keepalive"""
        resp = self.session.post(
            f"{self.base}/sensors/{sensor_id}/keepalive",
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()

    def report_anomaly(self, sensor_id: str, description: str) -> dict:
        """POST /sensors/:id/anomalies"""
        resp = self.session.post(
            f"{self.base}/sensors/{sensor_id}/anomalies",
            json={"description": description},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()

    def download_firmware(self, url: str, dest: Path) -> int:
        """GET <download_link> → streams .bin to disk, returns byte count."""
        with self.session.get(url, stream=True, timeout=60) as resp:
            resp.raise_for_status()
            total = 0
            with open(dest, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
                    total += len(chunk)
        return total

# ─── Simulated device behaviours ──────────────────────────────────────────────

ANOMALY_DESCRIPTIONS = [
    "Voltage spike detected: 265V (threshold 240V)",
    "Temperature sensor reading out of range: 87°C",
    "Current imbalance detected on phase B",
    "Communication timeout with sub-node #3",
    "Power factor dropped below 0.85",
    "Harmonic distortion above 8% THD",
    "Ground fault current detected: 15mA",
]

def simulate_flash(firmware_path: Path, version: str) -> bool:
    """Simulate writing firmware to flash memory."""
    action(f"Flashing {firmware_path.name} ({firmware_path.stat().st_size} bytes)…")
    steps = ["Erasing flash sectors", "Writing image", "Verifying checksum", "Finalising"]
    for step in steps:
        dim(f"  {step}…")
        time.sleep(random.uniform(0.3, 0.8))

    # 5% chance of flash failure (to test error paths)
    if random.random() < 0.05:
        error("Flash verification failed — CRC mismatch!")
        return False

    ok(f"Firmware {version} installed successfully")
    return True

def simulate_reboot(interval: int) -> None:
    """Simulate device rebooting."""
    action("Rebooting… halting main loop")
    for i in range(3, 0, -1):
        dim(f"  Reboot in {i}s…")
        time.sleep(1)
    ok("Reboot complete — resuming keepalive loop")

# ─── Main loop ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="VoltGuard Device Simulator")
    parser.add_argument("--url",       default="http://localhost:8080", help="OAM base URL")
    parser.add_argument("--name",      default=None,                    help="Sensor name (generated if omitted)")
    parser.add_argument("--district",  default="Lisboa",                help="District")
    parser.add_argument("--interval",  type=int, default=5,             help="Keepalive interval in seconds")
    parser.add_argument("--id",        default=None,                    help="Reuse existing sensor UUID")
    parser.add_argument("--anomalies", action="store_true",             help="Enable random anomaly reports")
    parser.add_argument("--anomaly-chance", type=float, default=0.1,    help="Probability per cycle (0-1, default 0.1)")
    args = parser.parse_args()

    # ── Banner ────────────────────────────────────────────────────────────────
    print()
    print(f"  {BOLD}{CYAN}⚡ VoltGuard Device Simulator{RESET}")
    print(f"  {GRAY}OAM: {args.url}  |  interval: {args.interval}s  |  anomalies: {args.anomalies}{RESET}")
    print()

    client = OamClient(args.url)
    state  = load_state()

    # ── Registration ──────────────────────────────────────────────────────────
    sensor_id      = args.id or state.get("sensor_id")
    current_fw_ver = state.get("firmware_version", "none")

    if sensor_id:
        info(f"Reusing sensor ID {sensor_id}")
    else:
        name = args.name or f"Sim-{uuid.uuid4().hex[:6].upper()}"
        info(f"Registering new sensor: {name!r} / {args.district}")
        try:
            sensor = client.register(name, args.district)
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 409:
                error(f"Name '{name}' already exists — use --name with a unique value or --id to reuse")
            else:
                error(f"Registration failed: {e}")
            sys.exit(1)
        except requests.RequestException as e:
            error(f"Cannot reach OAM at {args.url}: {e}")
            sys.exit(1)

        sensor_id = sensor["id"]
        ok(f"Registered — ID: {sensor_id}")
        state["sensor_id"] = sensor_id
        save_state(state)

    # ── Keepalive loop ────────────────────────────────────────────────────────
    cycle = 0
    firmware_dir = Path("./firmware_downloads")
    firmware_dir.mkdir(exist_ok=True)

    print()
    info(f"Starting keepalive loop  (Ctrl+C to stop)")
    print()

    try:
        while True:
            cycle += 1
            dim(f"Cycle #{cycle}  |  firmware: {current_fw_ver}")

            # ── Keepalive ─────────────────────────────────────────────────
            try:
                response = client.keepalive(sensor_id)
            except requests.HTTPError as e:
                error(f"Keepalive HTTP {e.response.status_code}: {e.response.text}")
                time.sleep(args.interval)
                continue
            except requests.RequestException as e:
                warn(f"Keepalive failed (network): {e}")
                time.sleep(args.interval)
                continue

            pending = response.get("action", "NONE")

            # ── Handle pending action ─────────────────────────────────────
            if pending == "UPDATE_FIRMWARE":
                fw_id    = response.get("target_firmware_id", "?")
                dl_link  = response.get("download_link")

                action(f"UPDATE_FIRMWARE received  →  target: {fw_id}")

                if not dl_link:
                    error("No download_link in response — skipping")
                else:
                    dest = firmware_dir / f"{fw_id}.bin"
                    try:
                        info(f"Downloading from {dl_link}")
                        size = client.download_firmware(dl_link, dest)
                        ok(f"Downloaded {size} bytes → {dest}")

                        # Extract version from filename for display
                        new_version = fw_id[:8]
                        if simulate_flash(dest, new_version):
                            current_fw_ver = new_version
                            state["firmware_version"] = current_fw_ver
                            save_state(state)
                        else:
                            warn("Flash failed — device will retry on next keepalive if action re-scheduled")

                    except requests.RequestException as e:
                        error(f"Firmware download failed: {e}")

            elif pending == "REBOOT":
                action("REBOOT received")
                simulate_reboot(args.interval)

            else:
                ok(f"Keepalive ACK  →  action: {pending}")

            # ── Random anomaly report ─────────────────────────────────────
            if args.anomalies and random.random() < args.anomaly_chance:
                desc = random.choice(ANOMALY_DESCRIPTIONS)
                try:
                    client.report_anomaly(sensor_id, desc)
                    warn(f"Anomaly reported: {desc}")
                except requests.RequestException as e:
                    error(f"Failed to report anomaly: {e}")

            # ── Wait ──────────────────────────────────────────────────────
            time.sleep(args.interval)

    except KeyboardInterrupt:
        print()
        info("Simulator stopped")
        print(f"  {GRAY}State saved in {STATE_FILE}  |  sensor ID: {sensor_id}{RESET}")
        print()


if __name__ == "__main__":
    main()
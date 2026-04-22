# VoltGuard Sensor Simulator

Generates synthetic sensor telemetry and pushes it to the anomaly-detection
service so the composer UI lights up with real events.

## Two simulators

- `simdevices.py` — device-lifecycle simulator (registration, keepalive, firmware,
  text-mode anomalies). Targets OAM only.
- `multipleSensors/simulator.py` — the real measurement simulator. Sends numeric
  datasets to the anomaly-detection service, which triggers the composer webhook.

## Quick start (measurement simulator)

```bash
cd multipleSensors
pip install -r requirements.txt

# First run: fetch sensors from OAM
python simulator.py --generate-config

# Random load (default)
python simulator.py
```

## Demo mode

For a live demo, use deterministic injection: the simulator schedules anomalies
on a fixed cadence, pins them to the last points of the 8-point flush window
(so Prophet's 80/20 validation split always catches them), and prints a loud
banner before each one so the presenter can narrate it.

```bash
# Scheduled injections, fast cycles, loud banner — sane defaults
python simulator.py --demo-mode

# Aim at one sensor (prefix match on uuid or name)
python simulator.py --demo-mode --target-sensor Lisboa

# Force a specific anomaly type
python simulator.py --demo-mode --pattern voltage_spike --intensity 3

# Manual tuning without the demo-mode preset
python simulator.py --inject-every 4 --intensity 2.0 --anomaly-window 2
```

Demo mode defaults: `--interval 5`, `--inject-every 4` (one anomaly every ~20 s),
`--intensity 2.0`, `--anomaly-window 2`, `--stats-every 3`. Explicit flags always
override the demo defaults.

Available patterns: `voltage_spike`, `current_overload`, `frequency_drift`,
`power_factor_drop`, `thermal_runaway`.

## How anomalies surface in the UI

1. Simulator buffers 8 points per (sensor, metric), then `POST /v1/measurements`.
2. Anomaly service trains Prophet on 80 % of the points and checks the last 20 %
   against the confidence interval. Points outside the bounds become anomalies.
3. Anomaly service fires an `anomaly_detected` webhook to the composer backend.
4. Composer dashboard shows the new anomaly on the Anomalies page.

Demo mode drops the spike on the tail of the buffer (cycles `--anomaly-window`
and later), so detection is reliable instead of probabilistic.

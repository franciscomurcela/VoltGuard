CREATE TABLE anomalies_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    sensor_id   UUID        NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    description TEXT        NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

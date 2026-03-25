CREATE TYPE anomaly_status_enum AS ENUM ('NONE', 'DETECTED');
CREATE TYPE pending_action_enum AS ENUM ('NONE', 'REBOOT', 'UPDATE_FIRMWARE');

CREATE TABLE sensors (
    id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(255)        NOT NULL,
    ultimo_keepalive    TIMESTAMPTZ,
    current_firmware_id UUID                REFERENCES firmwares(id) ON DELETE SET NULL,
    anomaly_status      anomaly_status_enum NOT NULL DEFAULT 'NONE',
    pending_action      pending_action_enum NOT NULL DEFAULT 'NONE',
    pending_firmware_id UUID                REFERENCES firmwares(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

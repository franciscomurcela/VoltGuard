CREATE TABLE firmwares (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    version     VARCHAR(50) NOT NULL UNIQUE,
    file_path   TEXT        NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

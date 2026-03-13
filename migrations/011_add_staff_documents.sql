CREATE TABLE IF NOT EXISTS staff_documents (
    id              SERIAL PRIMARY KEY,
    staff_id        INT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    document_type   VARCHAR(60) NOT NULL,
    period_from     DATE,
    period_to       DATE,
    signed_at       TIMESTAMPTZ,
    signer_name     VARCHAR(150) NOT NULL,
    signature_hash  VARCHAR(64) NOT NULL,
    signature_token VARCHAR(64),
    file_path       TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_documents_staff ON staff_documents(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_documents_type ON staff_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_staff_documents_period ON staff_documents(period_from, period_to);
CREATE INDEX IF NOT EXISTS idx_staff_documents_signed_at ON staff_documents(signed_at);

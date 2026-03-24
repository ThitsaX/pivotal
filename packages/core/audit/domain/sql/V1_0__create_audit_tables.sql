CREATE TABLE IF NOT EXISTS outbound_parties (
    id BIGINT PRIMARY KEY,
    correlation_id VARCHAR(128) NOT NULL,
    rail VARCHAR(32) NOT NULL,
    payer_fsp VARCHAR(32) NOT NULL,
    payee_fsp VARCHAR(32) NOT NULL,
    party_id_type VARCHAR(32) NOT NULL,
    party_id VARCHAR(128) NOT NULL,
    sub_id VARCHAR(128),
    response JSONB,
    error JSONB,
    failed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

ALTER TABLE outbound_parties ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(128);
UPDATE outbound_parties SET correlation_id = CAST(id AS VARCHAR(128)) WHERE correlation_id IS NULL;
ALTER TABLE outbound_parties ALTER COLUMN correlation_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS outbound_parties_01_idx ON outbound_parties (party_id_type, party_id);
CREATE INDEX IF NOT EXISTS outbound_parties_02_idx ON outbound_parties (party_id_type, party_id, sub_id);
CREATE INDEX IF NOT EXISTS outbound_parties_03_idx ON outbound_parties (created_at);
CREATE INDEX IF NOT EXISTS outbound_parties_04_idx ON outbound_parties (completed_at);
CREATE INDEX IF NOT EXISTS outbound_parties_05_idx ON outbound_parties (payer_fsp, payee_fsp);
CREATE INDEX IF NOT EXISTS outbound_parties_06_idx ON outbound_parties (rail);
CREATE INDEX IF NOT EXISTS outbound_parties_07_idx ON outbound_parties (failed);
CREATE INDEX IF NOT EXISTS outbound_parties_08_idx ON outbound_parties (correlation_id);

CREATE TABLE IF NOT EXISTS outbound_quotes (
    id BIGINT PRIMARY KEY,
    correlation_id VARCHAR(128) NOT NULL,
    rail VARCHAR(32) NOT NULL,
    payer_fsp VARCHAR(32) NOT NULL,
    payee_fsp VARCHAR(32) NOT NULL,
    quote_id VARCHAR(64) NOT NULL,
    scenario VARCHAR(32) NOT NULL,
    sub_scenario VARCHAR(128),
    amount JSONB NOT NULL,
    request JSONB NOT NULL,
    response JSONB,
    error JSONB,
    failed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

ALTER TABLE outbound_quotes ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(128);
UPDATE outbound_quotes SET correlation_id = CAST(id AS VARCHAR(128)) WHERE correlation_id IS NULL;
ALTER TABLE outbound_quotes ALTER COLUMN correlation_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS outbound_quotes_01_idx ON outbound_quotes (quote_id);
CREATE INDEX IF NOT EXISTS outbound_quotes_02_idx ON outbound_quotes (created_at);
CREATE INDEX IF NOT EXISTS outbound_quotes_03_idx ON outbound_quotes (completed_at);
CREATE INDEX IF NOT EXISTS outbound_quotes_04_idx ON outbound_quotes (payer_fsp, payee_fsp);
CREATE INDEX IF NOT EXISTS outbound_quotes_05_idx ON outbound_quotes (rail);
CREATE INDEX IF NOT EXISTS outbound_quotes_06_idx ON outbound_quotes (failed);
CREATE INDEX IF NOT EXISTS outbound_quotes_07_idx ON outbound_quotes (correlation_id);

CREATE TABLE IF NOT EXISTS outbound_transfers (
    id BIGINT PRIMARY KEY,
    correlation_id VARCHAR(128) NOT NULL,
    rail VARCHAR(32) NOT NULL,
    payer_fsp VARCHAR(32) NOT NULL,
    payee_fsp VARCHAR(32) NOT NULL,
    transfer_id VARCHAR(64) NOT NULL,
    request JSONB NOT NULL,
    response JSONB,
    error JSONB,
    failed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

ALTER TABLE outbound_transfers ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(128);
UPDATE outbound_transfers SET correlation_id = CAST(id AS VARCHAR(128)) WHERE correlation_id IS NULL;
ALTER TABLE outbound_transfers ALTER COLUMN correlation_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS outbound_transfers_01_idx ON outbound_transfers (transfer_id);
CREATE INDEX IF NOT EXISTS outbound_transfers_02_idx ON outbound_transfers (created_at);
CREATE INDEX IF NOT EXISTS outbound_transfers_03_idx ON outbound_transfers (completed_at);
CREATE INDEX IF NOT EXISTS outbound_transfers_04_idx ON outbound_transfers (payer_fsp, payee_fsp);
CREATE INDEX IF NOT EXISTS outbound_transfers_05_idx ON outbound_transfers (rail);
CREATE INDEX IF NOT EXISTS outbound_transfers_06_idx ON outbound_transfers (failed);
CREATE INDEX IF NOT EXISTS outbound_transfers_07_idx ON outbound_transfers (correlation_id);

CREATE TABLE IF NOT EXISTS inbound_parties (
    id BIGINT PRIMARY KEY,
    correlation_id VARCHAR(128) NOT NULL,
    rail VARCHAR(32) NOT NULL,
    payer_fsp VARCHAR(32) NOT NULL,
    payee_fsp VARCHAR(32) NOT NULL,
    party_id_type VARCHAR(32) NOT NULL,
    party_id VARCHAR(128) NOT NULL,
    sub_id VARCHAR(128),
    response JSONB,
    error JSONB,
    fsp_error TEXT,
    failed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

ALTER TABLE inbound_parties ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(128);
UPDATE inbound_parties SET correlation_id = CAST(id AS VARCHAR(128)) WHERE correlation_id IS NULL;
ALTER TABLE inbound_parties ALTER COLUMN correlation_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS inbound_parties_01_idx ON inbound_parties (party_id_type, party_id);
CREATE INDEX IF NOT EXISTS inbound_parties_02_idx ON inbound_parties (party_id_type, party_id, sub_id);
CREATE INDEX IF NOT EXISTS inbound_parties_03_idx ON inbound_parties (created_at);
CREATE INDEX IF NOT EXISTS inbound_parties_04_idx ON inbound_parties (completed_at);
CREATE INDEX IF NOT EXISTS inbound_parties_05_idx ON inbound_parties (payer_fsp, payee_fsp);
CREATE INDEX IF NOT EXISTS inbound_parties_06_idx ON inbound_parties (rail);
CREATE INDEX IF NOT EXISTS inbound_parties_07_idx ON inbound_parties (failed);
CREATE INDEX IF NOT EXISTS inbound_parties_08_idx ON inbound_parties (correlation_id);

CREATE TABLE IF NOT EXISTS inbound_quotes (
    id BIGINT PRIMARY KEY,
    correlation_id VARCHAR(128) NOT NULL,
    rail VARCHAR(32) NOT NULL,
    payer_fsp VARCHAR(32) NOT NULL,
    payee_fsp VARCHAR(32) NOT NULL,
    quote_id VARCHAR(64) NOT NULL,
    scenario VARCHAR(32) NOT NULL,
    sub_scenario VARCHAR(128),
    amount JSONB NOT NULL,
    request JSONB NOT NULL,
    response JSONB,
    error JSONB,
    fsp_error TEXT,
    failed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

ALTER TABLE inbound_quotes ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(128);
UPDATE inbound_quotes SET correlation_id = CAST(id AS VARCHAR(128)) WHERE correlation_id IS NULL;
ALTER TABLE inbound_quotes ALTER COLUMN correlation_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS inbound_quotes_01_idx ON inbound_quotes (quote_id);
CREATE INDEX IF NOT EXISTS inbound_quotes_02_idx ON inbound_quotes (created_at);
CREATE INDEX IF NOT EXISTS inbound_quotes_03_idx ON inbound_quotes (completed_at);
CREATE INDEX IF NOT EXISTS inbound_quotes_04_idx ON inbound_quotes (payer_fsp, payee_fsp);
CREATE INDEX IF NOT EXISTS inbound_quotes_05_idx ON inbound_quotes (rail);
CREATE INDEX IF NOT EXISTS inbound_quotes_06_idx ON inbound_quotes (failed);
CREATE INDEX IF NOT EXISTS inbound_quotes_07_idx ON inbound_quotes (correlation_id);

CREATE TABLE IF NOT EXISTS inbound_transfers (
    id BIGINT PRIMARY KEY,
    correlation_id VARCHAR(128) NOT NULL,
    rail VARCHAR(32) NOT NULL,
    payer_fsp VARCHAR(32) NOT NULL,
    payee_fsp VARCHAR(32) NOT NULL,
    transfer_id VARCHAR(64) NOT NULL,
    request JSONB NOT NULL,
    response JSONB,
    error JSONB,
    fsp_error TEXT,
    failed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

ALTER TABLE inbound_transfers ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(128);
UPDATE inbound_transfers SET correlation_id = CAST(id AS VARCHAR(128)) WHERE correlation_id IS NULL;
ALTER TABLE inbound_transfers ALTER COLUMN correlation_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS inbound_transfers_01_idx ON inbound_transfers (transfer_id);
CREATE INDEX IF NOT EXISTS inbound_transfers_02_idx ON inbound_transfers (created_at);
CREATE INDEX IF NOT EXISTS inbound_transfers_03_idx ON inbound_transfers (completed_at);
CREATE INDEX IF NOT EXISTS inbound_transfers_04_idx ON inbound_transfers (payer_fsp, payee_fsp);
CREATE INDEX IF NOT EXISTS inbound_transfers_05_idx ON inbound_transfers (rail);
CREATE INDEX IF NOT EXISTS inbound_transfers_06_idx ON inbound_transfers (failed);
CREATE INDEX IF NOT EXISTS inbound_transfers_07_idx ON inbound_transfers (correlation_id);

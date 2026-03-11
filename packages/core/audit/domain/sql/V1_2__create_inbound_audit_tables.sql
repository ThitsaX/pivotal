CREATE TABLE inbound_parties (
    id BIGINT PRIMARY KEY,
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

CREATE INDEX inbound_parties_02_idx ON inbound_parties (party_id_type, party_id);
CREATE INDEX inbound_parties_03_idx ON inbound_parties (party_id_type, party_id, sub_id);
CREATE INDEX inbound_parties_04_idx ON inbound_parties (created_at);
CREATE INDEX inbound_parties_05_idx ON inbound_parties (completed_at);
CREATE INDEX inbound_parties_06_idx ON inbound_parties (payer_fsp, payee_fsp);
CREATE INDEX inbound_parties_07_idx ON inbound_parties (rail);
CREATE INDEX inbound_parties_08_idx ON inbound_parties (failed);

CREATE TABLE inbound_quotes (
    id BIGINT PRIMARY KEY,
    rail VARCHAR(32) NOT NULL,
    payer_fsp VARCHAR(32) NOT NULL,
    payee_fsp VARCHAR(32) NOT NULL,
    quote_id VARCHAR(64) NOT NULL,
    request JSONB NOT NULL,
    response JSONB,
    error JSONB,
    fsp_error TEXT,
    failed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

CREATE INDEX inbound_quotes_02_idx ON inbound_quotes (quote_id);
CREATE INDEX inbound_quotes_03_idx ON inbound_quotes (created_at);
CREATE INDEX inbound_quotes_04_idx ON inbound_quotes (completed_at);
CREATE INDEX inbound_quotes_05_idx ON inbound_quotes (payer_fsp, payee_fsp);
CREATE INDEX inbound_quotes_06_idx ON inbound_quotes (rail);
CREATE INDEX inbound_quotes_07_idx ON inbound_quotes (failed);

CREATE TABLE inbound_transfers (
    id BIGINT PRIMARY KEY,
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

CREATE INDEX inbound_transfers_02_idx ON inbound_transfers (transfer_id);
CREATE INDEX inbound_transfers_03_idx ON inbound_transfers (created_at);
CREATE INDEX inbound_transfers_04_idx ON inbound_transfers (completed_at);
CREATE INDEX inbound_transfers_05_idx ON inbound_transfers (payer_fsp, payee_fsp);
CREATE INDEX inbound_transfers_06_idx ON inbound_transfers (rail);
CREATE INDEX inbound_transfers_07_idx ON inbound_transfers (failed);

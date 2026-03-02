CREATE TABLE outbound_parties (
    id BIGINT PRIMARY KEY,
    rail VARCHAR(32) NOT NULL,
    payer_fsp VARCHAR(32) NOT NULL,
    payee_fsp VARCHAR(32) NOT NULL,
    correlation_id VARCHAR(128) NOT NULL,
    party_id_type VARCHAR(32) NOT NULL,
    party_id VARCHAR(128) NOT NULL,
    sub_id VARCHAR(128),
    response JSONB,
    error JSONB,
    failed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

CREATE INDEX outbound_parties_01_idx ON outbound_parties (correlation_id);
CREATE INDEX outbound_parties_02_idx ON outbound_parties (party_id_type, party_id);
CREATE INDEX outbound_parties_03_idx ON outbound_parties (party_id_type, party_id, sub_id);
CREATE INDEX outbound_parties_04_idx ON outbound_parties (created_at);
CREATE INDEX outbound_parties_05_idx ON outbound_parties (completed_at);
CREATE INDEX outbound_parties_06_idx ON outbound_parties (payer_fsp, payee_fsp);
CREATE INDEX outbound_parties_07_idx ON outbound_parties (rail);
CREATE INDEX outbound_parties_08_idx ON outbound_parties (failed);

CREATE TABLE outbound_quotes (
    id BIGINT PRIMARY KEY,
    rail VARCHAR(32) NOT NULL,
    payer_fsp VARCHAR(32) NOT NULL,
    payee_fsp VARCHAR(32) NOT NULL,
    correlation_id VARCHAR(128) NOT NULL,
    quote_id VARCHAR(64) NOT NULL,
    request JSONB NOT NULL,
    response JSONB,
    error JSONB,
    failed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

CREATE INDEX outbound_quotes_01_idx ON outbound_quotes (correlation_id);
CREATE INDEX outbound_quotes_02_idx ON outbound_quotes (quote_id);
CREATE INDEX outbound_quotes_03_idx ON outbound_quotes (created_at);
CREATE INDEX outbound_quotes_04_idx ON outbound_quotes (completed_at);
CREATE INDEX outbound_quotes_05_idx ON outbound_quotes (payer_fsp, payee_fsp);
CREATE INDEX outbound_quotes_06_idx ON outbound_quotes (rail);
CREATE INDEX outbound_quotes_07_idx ON outbound_quotes (failed);

CREATE TABLE outbound_transfers (
    id BIGINT PRIMARY KEY,
    rail VARCHAR(32) NOT NULL,
    payer_fsp VARCHAR(32) NOT NULL,
    payee_fsp VARCHAR(32) NOT NULL,
    correlation_id VARCHAR(128) NOT NULL,
    transfer_id VARCHAR(64) NOT NULL,
    request JSONB NOT NULL,
    response JSONB,
    error JSONB,
    failed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

CREATE INDEX outbound_transfers_01_idx ON outbound_transfers (correlation_id);
CREATE INDEX outbound_transfers_02_idx ON outbound_transfers (transfer_id);
CREATE INDEX outbound_transfers_03_idx ON outbound_transfers (created_at);
CREATE INDEX outbound_transfers_04_idx ON outbound_transfers (completed_at);
CREATE INDEX outbound_transfers_05_idx ON outbound_transfers (payer_fsp, payee_fsp);
CREATE INDEX outbound_transfers_06_idx ON outbound_transfers (rail);
CREATE INDEX outbound_transfers_07_idx ON outbound_transfers (failed);

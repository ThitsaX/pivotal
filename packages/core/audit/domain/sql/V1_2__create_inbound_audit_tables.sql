CREATE TABLE inbound_parties_request (
    id BIGINT PRIMARY KEY,
    rail VARCHAR(32) NOT NULL,
    payer_fsp VARCHAR(32) NOT NULL,
    payee_fsp VARCHAR(32) NOT NULL,
    correlation_id BIGINT NOT NULL,
    party_id_type VARCHAR(32) NOT NULL,
    party_id VARCHAR(128) NOT NULL,
    sub_id VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX inbound_parties_request_01_idx ON inbound_parties_request (correlation_id);
CREATE INDEX inbound_parties_request_02_idx ON inbound_parties_request (party_id_type, party_id);
CREATE INDEX inbound_parties_request_03_idx ON inbound_parties_request (party_id_type, party_id, sub_id);
CREATE INDEX inbound_parties_request_04_idx ON inbound_parties_request (created_at);
CREATE INDEX inbound_parties_request_05_idx ON inbound_parties_request (payer_fsp, payee_fsp);
CREATE INDEX inbound_parties_request_06_idx ON inbound_parties_request (rail);

CREATE TABLE inbound_parties_response (
    id BIGINT PRIMARY KEY,
    response JSONB,
    error JSONB,
    fsp_error TEXT,
    completed_at TIMESTAMPTZ
);

ALTER TABLE inbound_parties_response
    ADD CONSTRAINT inbound_parties_request_inbound_parties_response_FK
        FOREIGN KEY (id)
            REFERENCES inbound_parties_request (id);
CREATE INDEX inbound_parties_request_inbound_parties_response_FK_IDX ON inbound_parties_response (id);
CREATE INDEX inbound_parties_response_01_idx ON inbound_parties_response (completed_at);

CREATE TABLE inbound_quotes_request (
    id BIGINT PRIMARY KEY,
    rail VARCHAR(32) NOT NULL,
    payer_fsp VARCHAR(32) NOT NULL,
    payee_fsp VARCHAR(32) NOT NULL,
    correlation_id BIGINT NOT NULL,
    quote_id VARCHAR(64) NOT NULL,
    request JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX inbound_quotes_request_01_idx ON inbound_quotes_request (correlation_id);
CREATE INDEX inbound_quotes_request_02_idx ON inbound_quotes_request (quote_id);
CREATE INDEX inbound_quotes_request_03_idx ON inbound_quotes_request (created_at);
CREATE INDEX inbound_quotes_request_04_idx ON inbound_quotes_request (payer_fsp, payee_fsp);
CREATE INDEX inbound_quotes_request_05_idx ON inbound_quotes_request (rail);

CREATE TABLE inbound_quotes_response (
    id BIGINT PRIMARY KEY,
    response JSONB,
    error JSONB,
    fsp_error TEXT,
    completed_at TIMESTAMPTZ
);

ALTER TABLE inbound_quotes_response
    ADD CONSTRAINT inbound_quotes_request_inbound_quotes_response_FK
        FOREIGN KEY (id)
            REFERENCES inbound_quotes_request (id);
CREATE INDEX inbound_quotes_request_inbound_quotes_response_FK_IDX ON inbound_quotes_response (id);
CREATE INDEX inbound_quotes_response_01_idx ON inbound_quotes_response (completed_at);

CREATE TABLE inbound_transfers_request (
    id BIGINT PRIMARY KEY,
    rail VARCHAR(32) NOT NULL,
    payer_fsp VARCHAR(32) NOT NULL,
    payee_fsp VARCHAR(32) NOT NULL,
    correlation_id BIGINT NOT NULL,
    transfer_id VARCHAR(64) NOT NULL,
    request JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX inbound_transfers_request_01_idx ON inbound_transfers_request (correlation_id);
CREATE INDEX inbound_transfers_request_02_idx ON inbound_transfers_request (transfer_id);
CREATE INDEX inbound_transfers_request_03_idx ON inbound_transfers_request (created_at);
CREATE INDEX inbound_transfers_request_04_idx ON inbound_transfers_request (payer_fsp, payee_fsp);
CREATE INDEX inbound_transfers_request_05_idx ON inbound_transfers_request (rail);

CREATE TABLE inbound_transfers_response (
    id BIGINT PRIMARY KEY,
    response JSONB,
    error JSONB,
    fsp_error TEXT,
    completed_at TIMESTAMPTZ
);

ALTER TABLE inbound_transfers_response
    ADD CONSTRAINT inbound_transfers_request_inbound_transfers_response_FK
        FOREIGN KEY (id)
            REFERENCES inbound_transfers_request (id);
CREATE INDEX inbound_transfers_request_inbound_transfers_response_FK_IDX ON inbound_transfers_response (id);
CREATE INDEX inbound_transfers_response_01_idx ON inbound_transfers_response (completed_at);

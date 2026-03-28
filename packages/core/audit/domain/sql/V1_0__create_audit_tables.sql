CREATE TABLE IF NOT EXISTS transactions (
    id BIGINT PRIMARY KEY,
    correlation_id VARCHAR(128) NOT NULL,
    payer_fsp VARCHAR(32) NOT NULL,
    payee_fsp VARCHAR(32) NOT NULL,
    payer_id_type VARCHAR(32),
    payer_id VARCHAR(128),
    payer_sub_id VARCHAR(128),
    payee_id_type VARCHAR(32),
    payee_id VARCHAR(128),
    payee_sub_id VARCHAR(128),
    transaction_initiator_type VARCHAR(32),
    quoting_currency VARCHAR(3),
    quoting_amount DECIMAL(34, 4),
    transfer_currency VARCHAR(3),
    transfer_amount DECIMAL(34, 4),
    transaction_started_at TIMESTAMPTZ NOT NULL,
    transaction_completed_at TIMESTAMPTZ,
    transaction_type VARCHAR(32),
    sub_scenario VARCHAR(128),
    transfer_state VARCHAR(32),
    possible_dispute BOOLEAN NOT NULL DEFAULT FALSE,
    error BOOLEAN NOT NULL DEFAULT FALSE,
    parties_requested_at TIMESTAMPTZ,
    parties_responded_at TIMESTAMPTZ,
    parties_request JSONB,
    parties_response JSONB,
    parties_error JSONB,
    outbound_parties_requested_at TIMESTAMPTZ,
    outbound_parties_responded_at TIMESTAMPTZ,
    inbound_parties_requested_at TIMESTAMPTZ,
    inbound_parties_responded_at TIMESTAMPTZ,
    connector_parties_requested_at TIMESTAMPTZ,
    connector_parties_responded_at TIMESTAMPTZ,
    quotes_requested_at TIMESTAMPTZ,
    quotes_responded_at TIMESTAMPTZ,
    quotes_request JSONB,
    quotes_response JSONB,
    quotes_error JSONB,
    outbound_quotes_requested_at TIMESTAMPTZ,
    outbound_quotes_responded_at TIMESTAMPTZ,
    inbound_quotes_requested_at TIMESTAMPTZ,
    inbound_quotes_responded_at TIMESTAMPTZ,
    connector_quotes_requested_at TIMESTAMPTZ,
    connector_quotes_responded_at TIMESTAMPTZ,
    transfers_requested_at TIMESTAMPTZ,
    transfers_responded_at TIMESTAMPTZ,
    transfers_request JSONB,
    transfers_response JSONB,
    transfers_error JSONB,
    outbound_transfers_requested_at TIMESTAMPTZ,
    outbound_transfers_responded_at TIMESTAMPTZ,
    inbound_transfers_requested_at TIMESTAMPTZ,
    inbound_transfers_responded_at TIMESTAMPTZ,
    connector_transfers_requested_at TIMESTAMPTZ,
    connector_transfers_responded_at TIMESTAMPTZ,
    patch_requested_at TIMESTAMPTZ,
    patch_responded_at TIMESTAMPTZ,
    patch_request JSONB,
    patch_error TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS transactions_01_idx ON transactions (payer_fsp, payee_fsp, transfer_state, transaction_started_at);
CREATE INDEX IF NOT EXISTS transactions_02_idx ON transactions (payer_fsp, payee_fsp, transfer_state, transaction_completed_at);
CREATE INDEX IF NOT EXISTS transactions_03_idx ON transactions (payer_fsp, payee_fsp, transaction_type, sub_scenario, quoting_currency, transaction_started_at);
CREATE INDEX IF NOT EXISTS transactions_04_idx ON transactions (payer_fsp, payee_fsp, transaction_type, sub_scenario, transfer_currency, transaction_started_at);
CREATE INDEX IF NOT EXISTS transactions_05_idx ON transactions (payer_fsp, payee_fsp, error, transaction_started_at);
CREATE INDEX IF NOT EXISTS transactions_06_idx ON transactions (created_at);
CREATE INDEX IF NOT EXISTS transactions_07_idx ON transactions (updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_08_uk ON transactions (correlation_id);
CREATE INDEX IF NOT EXISTS transactions_09_idx ON transactions (payer_fsp, payee_fsp, outbound_parties_requested_at);
CREATE INDEX IF NOT EXISTS transactions_10_idx ON transactions (payer_fsp, payee_fsp, inbound_parties_requested_at);
CREATE INDEX IF NOT EXISTS transactions_11_idx ON transactions (payer_fsp, payee_fsp, outbound_quotes_requested_at);
CREATE INDEX IF NOT EXISTS transactions_12_idx ON transactions (payer_fsp, payee_fsp, inbound_quotes_requested_at);
CREATE INDEX IF NOT EXISTS transactions_13_idx ON transactions (payer_fsp, payee_fsp, outbound_transfers_requested_at);
CREATE INDEX IF NOT EXISTS transactions_14_idx ON transactions (payer_fsp, payee_fsp, inbound_transfers_requested_at);
CREATE INDEX IF NOT EXISTS transactions_15_idx ON transactions (payer_id_type, payer_id, payer_sub_id, transaction_started_at);
CREATE INDEX IF NOT EXISTS transactions_16_idx ON transactions (payee_id_type, payee_id, payee_sub_id, transaction_started_at);
CREATE INDEX IF NOT EXISTS transactions_17_idx ON transactions (possible_dispute, transaction_started_at);

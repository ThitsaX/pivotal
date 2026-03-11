DROP INDEX IF EXISTS outbound_parties_01_idx;
DROP INDEX IF EXISTS outbound_quotes_01_idx;
DROP INDEX IF EXISTS outbound_transfers_01_idx;
DROP INDEX IF EXISTS inbound_parties_01_idx;
DROP INDEX IF EXISTS inbound_quotes_01_idx;
DROP INDEX IF EXISTS inbound_transfers_01_idx;

ALTER TABLE outbound_parties DROP COLUMN IF EXISTS correlation_id;
ALTER TABLE outbound_quotes DROP COLUMN IF EXISTS correlation_id;
ALTER TABLE outbound_transfers DROP COLUMN IF EXISTS correlation_id;
ALTER TABLE inbound_parties DROP COLUMN IF EXISTS correlation_id;
ALTER TABLE inbound_quotes DROP COLUMN IF EXISTS correlation_id;
ALTER TABLE inbound_transfers DROP COLUMN IF EXISTS correlation_id;

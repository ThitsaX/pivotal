-- Keyset (cursor) pagination support for "Find Transactions".
--
-- Each surviving sort column needs its own `(sortColumn, id)` covering tuple so the
-- keyset seek `(sortColumn, id) <> (:cursorValue, :cursorId)` is fully index-ordered.
-- DFSP access scope is served as two index-seekable legs (payer / payee), so the
-- fsp-prefixed variants exist as well.
--
-- (`correlation_id` is already UNIQUE — `transactions_08_uk` — so the Transfer ID
--  (correlationId) sort needs no extra index.)
CREATE INDEX `transactions_18_idx` ON `transactions` (`transaction_started_at`, `id`);
CREATE INDEX `transactions_19_idx` ON `transactions` (`payer_fsp`, `transaction_started_at`, `id`);
CREATE INDEX `transactions_20_idx` ON `transactions` (`payee_fsp`, `transaction_started_at`, `id`);
CREATE INDEX `transactions_21_idx` ON `transactions` (`transaction_completed_at`, `id`);

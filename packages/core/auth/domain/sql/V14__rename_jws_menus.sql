-- Rename the two JWS menus and their permission descriptions on EXISTING installs.
--
-- Both menus were labelled "Update Signing Keys", which describes neither. The Hub screen registers
-- the Hub's public key, used only to verify what the Hub signs; Pivotal holds no Hub private key.
-- The participant screen changes no keys at all: it holds the two JWS switches, sign and verify.
--
-- Why a migration is needed: `RbacSeeder` inserts only into empty tables, so a database seeded with
-- the old labels keeps them. On a fresh database these updates match no rows and the seeder then
-- inserts the new labels.
--
-- Idempotent: plain UPDATEs keyed on the unique `menu_key` and `key_name`.

UPDATE `menus`
SET `label` = 'Hub JWS Public Key'
WHERE `menu_key` = 'hub-add-signing-keys';

UPDATE `menus`
SET `label` = 'JWS Policy'
WHERE `menu_key` = 'participant-add-signing-keys';

UPDATE `permissions`
SET `description` = 'Register the Hub''s JWS public key, used to verify messages the Hub signs.'
WHERE `key_name` = 'hub.signing-keys.update';

UPDATE `permissions`
SET `description` = 'View and change a participant''s JWS policy: whether Pivotal signs as them, and how strictly their signatures are verified.'
WHERE `key_name` = 'participant.signing-keys.update';

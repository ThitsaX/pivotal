-- Splits JWS identity out of `participant`.
--
-- `participant` conflates two different things: tenants Pivotal fronts (which need a private key)
-- and peers it merely talks to (which need only a public key). It cannot represent the second at
-- all — `add-signing-keys` marks the private key mandatory — yet web-inbound must verify signatures
-- from peers, from the Hub, and from Pivotal's own tenants whose traffic the Hub relays back.
--
-- `fsp_id` is case-sensitive on purpose. The runtime cache keys on the id verbatim, so a
-- case-insensitive unique key would let `hub` and `Hub` collapse into one row that then fails to
-- match at lookup time.

CREATE TABLE IF NOT EXISTS `participant_key`
(
    `id`               BIGINT       NOT NULL AUTO_INCREMENT,
    `fsp_id`           VARCHAR(128) COLLATE utf8mb4_0900_as_cs NOT NULL,

    -- 'self' = Pivotal signs as this participant. 'peer' = Pivotal only verifies it.
    `role`             VARCHAR(8)   NOT NULL,

    `jws_public_key`   TEXT         NULL,
    `jws_private_key`  TEXT         NULL,

    -- Sign outbound requests carrying this fspiop-source. Off by default: rollout is opt-in.
    `jws_sign_enabled` TINYINT(1)   NOT NULL DEFAULT 0,

    -- How strictly to verify inbound requests from this source.
    -- 'off' | 'verify-if-present' | 'require'
    `jws_verify_mode`  VARCHAR(20)  NOT NULL DEFAULT 'off',

    `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `participant_key_01_uk` (`fsp_id`),
    KEY `participant_key_01_ix` (`role`),

    CONSTRAINT `participant_key_01_ck` CHECK (`role` IN ('self', 'peer')),
    CONSTRAINT `participant_key_02_ck` CHECK (`jws_verify_mode` IN ('off', 'verify-if-present', 'require'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;

-- Carry across whatever identities already exist. These rows are created switched off, so the
-- migration changes no behaviour: signing stays off until an operator enables a participant.
--
-- The key columns on `participant` are left in place and become vestigial once nothing reads them.
-- They are not dropped here: a rollback of the application should not lose data the old code path
-- still expects to find.
--
-- Role is inferred from whether a private key is held, which is the only signal available and is
-- the same rule the application applies when registering a new key. A row with no keys at all
-- lands as 'peer' and is corrected the moment keys are registered for it; role is descriptive
-- rather than enforcing, so the interim value changes no behaviour.
INSERT IGNORE INTO `participant_key` (`fsp_id`, `role`, `jws_public_key`, `jws_private_key`)
SELECT `name`,
       CASE WHEN `jws_private_key` IS NOT NULL AND TRIM(`jws_private_key`) <> ''
            THEN 'self' ELSE 'peer' END,
       `jws_public_key`,
       `jws_private_key`
FROM `participant`
WHERE `name` IS NOT NULL
  AND TRIM(`name`) <> '';

-- Seed the Hub as a peer so that Hub-originated errors have somewhere to resolve a key.
--
-- Without a row here, enabling verification fails every Hub-generated error with 3105. The public
-- key is left NULL because it does not come from Pivotal: obtain the Hub's certificate from its
-- operator and extract the key with `openssl x509 -pubkey -noout`, then populate this row.
--
-- 'hub' is the default switch id. A deployment configured with a different FSPIOP_SWITCH_ID needs
-- its own row — the id is matched verbatim, so casing matters.
INSERT IGNORE INTO `participant_key` (`fsp_id`, `role`, `jws_verify_mode`)
VALUES ('hub', 'peer', 'off');

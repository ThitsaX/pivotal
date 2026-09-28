-- Client certificates Pivotal issues to DFSPs for the DFSP-facing leg.
--
-- The row is the record of issuance, not a cache of one: Vault's `dfsp-client` role runs with
-- `no_store=true`, so nothing upstream retains the certificate. If this table loses a row, the
-- certificate does not stop working — it becomes unaccountable, which is worse.
--
-- `fsp_id` is the binding target. A request is rejected unless the certificate presented and the
-- `FSPIOP-Source` header name the same DFSP; without that, any enrolled tenant's certificate plus a
-- leaked accessKey for another tenant is enough to transact as that other tenant.

-- Status is a table rather than a CHECK constraint or an application enum. The lifecycle already
-- has four states and gains more as revocation and renewal policy settle, and a status that lives
-- in the database can be read by the reporting and operator tooling that never loads application
-- code.
CREATE TABLE IF NOT EXISTS `participant_cert_status`
(
    `code`        VARCHAR(16)  NOT NULL,
    `description` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`code`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;

INSERT IGNORE INTO `participant_cert_status` (`code`, `description`)
VALUES ('active', 'Presented and accepted. The certificate a DFSP is currently expected to use.'),
       ('retiring', 'Superseded by a newer certificate but still accepted until it expires, so a '
                    'renewal needs no coordinated cutover.'),
       ('revoked', 'Withdrawn before expiry and never to be accepted again.'),
       ('expired', 'Past valid_to. Retained so a presented certificate resolves to a reason rather '
                   'than to nothing.');

CREATE TABLE IF NOT EXISTS `participant_cert`
(
    `id`                 BIGINT       NOT NULL AUTO_INCREMENT,

    -- Case-sensitive for the same reason as participant_key: the runtime matches the id verbatim,
    -- so a case-insensitive key would let 'dfsp' and 'DFSP' collapse into one row that then fails
    -- to match at lookup time.
    `fsp_id`             VARCHAR(128) COLLATE utf8mb4_0900_as_cs NOT NULL,

    -- The runtime lookup key. A request arrives carrying the peer certificate; its SHA-256
    -- fingerprint is what resolves to this row, so it is unique across every tenant and status.
    `fingerprint_sha256` CHAR(64)     NOT NULL,

    `serial`             VARCHAR(128) NOT NULL,

    -- Set by Pivotal at issuance, never taken from the submitted CSR, so no certificate can exist
    -- whose subject contradicts its fsp_id.
    `subject`            VARCHAR(512) NOT NULL,

    `cert_pem`           TEXT         NOT NULL,
    `ca_chain_pem`       TEXT         NULL,

    `status`             VARCHAR(16)  NOT NULL DEFAULT 'active',

    `valid_from`         DATETIME     NOT NULL,
    `valid_to`           DATETIME     NOT NULL,
    `issued_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `revoked_at`         DATETIME     NULL,

    -- Free text from the operator who performed the enrollment: a ticket reference, who asked, why.
    -- Enrollment is operator-mediated, so the audit trail otherwise stops at "someone with the
    -- permission did this".
    `note`               VARCHAR(512) NULL,

    `created_at`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `participant_cert_01_uk` (`fingerprint_sha256`),
    UNIQUE KEY `participant_cert_02_uk` (`serial`),

    -- The runtime path is fingerprint alone; these serve the operator views and the expiry sweep.
    KEY `participant_cert_01_ix` (`fsp_id`, `status`),
    KEY `participant_cert_02_ix` (`valid_to`),

    CONSTRAINT `participant_cert_01_fk` FOREIGN KEY (`status`)
        REFERENCES `participant_cert_status` (`code`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;

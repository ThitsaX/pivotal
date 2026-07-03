-- SPDX-License-Identifier: Apache-2.0
-- Copyright 2026 ThitsaWorks
ALTER TABLE `participant`
    MODIFY COLUMN `jws_public_key` TEXT NULL,
    MODIFY COLUMN `jws_private_key` TEXT NULL;

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {CustomDecorator, SetMetadata} from '@nestjs/common';

export const IS_SIGNED_TRANSFER_STATUS_KEY = 'access:signed-transfer-status';

export const SignedTransferStatus = (): CustomDecorator<string> =>
    SetMetadata(IS_SIGNED_TRANSFER_STATUS_KEY, true);

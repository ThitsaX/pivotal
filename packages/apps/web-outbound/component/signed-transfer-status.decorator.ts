// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {CustomDecorator, SetMetadata} from '@nestjs/common';

export const IS_SIGNED_GET_KEY = 'access:signed-transfer-status';

// Kept as an alias so callers and tests using the original transfer-status name continue
// to work while the same signed-GET scheme is shared by other bodyless endpoints.
export const IS_SIGNED_TRANSFER_STATUS_KEY = IS_SIGNED_GET_KEY;

export const SignedGet = (): CustomDecorator<string> =>
    SetMetadata(IS_SIGNED_GET_KEY, true);

export const SignedTransferStatus = (): CustomDecorator<string> =>
    SignedGet();

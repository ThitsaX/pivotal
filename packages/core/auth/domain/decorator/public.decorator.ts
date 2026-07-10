// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {SetMetadata, CustomDecorator} from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:public';

export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);

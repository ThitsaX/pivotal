// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'access:public';

export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);

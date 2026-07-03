// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'access:public';

export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);

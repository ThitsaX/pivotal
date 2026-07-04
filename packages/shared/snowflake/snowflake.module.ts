// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import { Module } from '@nestjs/common';
import { Snowflake } from './component';

@Module({
  imports: [],
  providers: [
    {
      provide: Snowflake,
      useFactory: () => Snowflake.get(),
    },
  ],
  exports: [Snowflake],
})
export class SnowflakeModule {}

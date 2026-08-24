// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { LogLevel } from '@nestjs/common';

export class LogLevelsResolver {
    private static readonly DEFAULT_LOG_LEVEL: string = 'log';

    private static readonly LOG_LEVELS: Record<string, LogLevel> = {
        verbose: 'verbose',
        debug: 'debug',
        log: 'log',
        warn: 'warn',
        error: 'error',
        fatal: 'fatal',
    };

    public static resolveLogLevels(value: string = this.DEFAULT_LOG_LEVEL): LogLevel[] {
        const levelName = value.trim().toLowerCase();
        let logLevel = this.LOG_LEVELS[levelName];

        // If invalid levelName, assign default level
        if (!logLevel) logLevel = this.LOG_LEVELS[this.DEFAULT_LOG_LEVEL];

        return [logLevel];
    }
}
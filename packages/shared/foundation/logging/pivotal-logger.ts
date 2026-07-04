// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';
import { MdcContext } from './mdc-context';

@Injectable({ scope: Scope.TRANSIENT })
export class PivotalLogger extends ConsoleLogger {
    protected override formatMessage(
        logLevel: string,
        message: unknown,
        pidMessage: string,
        formattedLogLevel: string,
        contextMessage: string,
        timestampDiff: string,
    ): string {
        const mdc = MdcContext.getAll();
        let mdcString = '';
        if (mdc[MdcContext.TRANSFER_ID]) {
            mdcString += `${MdcContext.TRANSFER_ID}=${mdc[MdcContext.TRANSFER_ID]} `;
        }
        if (mdc[MdcContext.ID_VALUE]) {
            mdcString += `${MdcContext.ID_VALUE}=${mdc[MdcContext.ID_VALUE]} `;
        }

        const mdcPart = mdcString ? `[${mdcString.trim()}] ` : '';

        const now = new Date();
        const timestamp = this.formatTimestamp(now);
        const level = this.getMappedLevel(logLevel);
        // Strip ANSI color codes from the context message
        const context = contextMessage ? contextMessage.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/[\[\]\s]/g, '') : '';
        const output = this.stringifyMessage(message, logLevel as any);

        // We return the full formatted line and override the print method to avoid NestJS default wrapping
        return `${timestamp} ${level} ${mdcPart}${context} : ${output}\n`;
    }

    // Override to prevent NestJS from adding PID, timestamp, and context again
    protected override printMessages(
        messages: unknown[],
        context?: string,
        logLevel?: string,
        writeStreamType?: 'stdout' | 'stderr',
        errorStack?: unknown,
    ) {
        messages.forEach(message => {
            const output = this.formatMessage(
                logLevel || 'log',
                message,
                '',
                '',
                context || '',
                '',
            );
            process[writeStreamType || 'stdout'].write(output);

            if (errorStack != null) {
                process[writeStreamType || 'stdout'].write(`${String(errorStack)}\n`);
            }
        });
    }
    private formatTimestamp(date: Date): string {
        const Y = date.getUTCFullYear();
        const M = String(date.getUTCMonth() + 1).padStart(2, '0');
        const D = String(date.getUTCDate()).padStart(2, '0');
        const h = String(date.getUTCHours()).padStart(2, '0');
        const m = String(date.getUTCMinutes()).padStart(2, '0');
        const s = String(date.getUTCSeconds()).padStart(2, '0');
        return `${Y}-${M}-${D} ${h}:${m}:${s}`;
    }

    private getMappedLevel(logLevel: string): string {
        switch (logLevel) {
            case 'log':
                return 'INFO ';
            case 'error':
                return 'ERROR';
            case 'warn':
                return 'WARN ';
            case 'debug':
                return 'DEBUG';
            case 'verbose':
                return 'TRACE';
            default:
                return logLevel.toUpperCase().padEnd(5);
        }
    }
}

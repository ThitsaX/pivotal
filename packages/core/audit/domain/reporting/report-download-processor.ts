// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {ReportDownloadRequest, ReportType} from '../model';
import {ReportDownloadRepository} from '../repository';
import {REPORT_DOWNLOAD_SETTINGS} from './tokens';
import {ReportDownloadSettings} from './report-download-settings';
import {S3ReportStorage} from './s3-report-storage';
import {TransactionReportGenerator} from './transaction-report-generator';

@Injectable()
export class ReportDownloadProcessor implements OnModuleInit, OnModuleDestroy {

    private static readonly LOGGER = new Logger(ReportDownloadProcessor.name);
    private static readonly HEARTBEAT_INTERVAL_MS = 60_000;

    private pollTimer: NodeJS.Timeout | null = null;
    private activeWorkers = 0;
    private stopped = false;

    constructor(
        private readonly reportDownloadRepository: ReportDownloadRepository,
        private readonly transactionReportGenerator: TransactionReportGenerator,
        private readonly storage: S3ReportStorage,
        @Inject(REPORT_DOWNLOAD_SETTINGS)
        private readonly settings: ReportDownloadSettings,
    ) {
    }

    onModuleInit(): void {
        if (!this.settings.workerEnabled) {
            ReportDownloadProcessor.LOGGER.log('Report download worker disabled.');
            return;
        }

        this.pollTimer = setInterval(() => {
            void this.safeDispatch();
        }, this.settings.pollIntervalMs);

        void this.safeDispatch();
    }

    onModuleDestroy(): void {
        this.stopped = true;

        if (this.pollTimer != null) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    private async dispatch(): Promise<void> {
        if (this.stopped) {
            return;
        }

        await this.recoverStaleRunning();

        const staleBefore = new Date(Date.now() - this.settings.staleRunningTtlMs);
        const runningCount = await this.reportDownloadRepository.countFreshRunning(staleBefore);
        const availableSlots = Math.max(0, this.settings.maxConcurrent - runningCount - this.activeWorkers);

        for (let i = 0; i < availableSlots; i++) {
            this.activeWorkers++;
            void this.processNext()
                .catch((error: unknown) => {
                    ReportDownloadProcessor.LOGGER.error(
                        `Report worker failed: ${ReportDownloadProcessor.errorMessage(error)}`,
                    );
                })
                .finally(() => {
                    this.activeWorkers--;
                });
        }
    }

    private async safeDispatch(): Promise<void> {
        try {
            await this.dispatch();
        } catch (error: unknown) {
            ReportDownloadProcessor.LOGGER.error(
                `Report worker dispatch failed: ${ReportDownloadProcessor.errorMessage(error)}`,
            );
        }
    }

    private async recoverStaleRunning(): Promise<void> {
        const staleBefore = new Date(Date.now() - this.settings.staleRunningTtlMs);
        const recovered = await this.reportDownloadRepository.failStaleRunning(staleBefore);

        if (recovered > 0) {
            ReportDownloadProcessor.LOGGER.warn(`Recovered ${recovered} stale report requests.`);
        }
    }

    private async processNext(): Promise<void> {
        const request = await this.reportDownloadRepository.claimNextPending();

        if (request == null) {
            return;
        }

        await this.processRequest(request);
    }

    private async processRequest(request: ReportDownloadRequest): Promise<void> {
        const heartbeat = this.startHeartbeat(request.id);

        try {
            const params = await this.reportDownloadRepository.findParamsByRequestId(request.id);
            const generatedFile = await this.generateFile(request, params);
            const objectKey = this.storage.buildObjectKey(request.reportType, request.id, generatedFile.extension);

            await this.storage.upload(objectKey, generatedFile.bytes, generatedFile.contentType);

            const marked = await this.reportDownloadRepository.markReady(request.id, objectKey);

            if (marked) {
                ReportDownloadProcessor.LOGGER.log(`Report request ${request.id} READY key=${objectKey}`);
            } else {
                ReportDownloadProcessor.LOGGER.warn(`Report request ${request.id} was not RUNNING during READY update.`);
            }
        } catch (error: unknown) {
            const message = ReportDownloadProcessor.errorMessage(error);
            const marked = await this.reportDownloadRepository.markFailed(request.id, message);

            if (!marked) {
                ReportDownloadProcessor.LOGGER.warn(`Report request ${request.id} was not RUNNING during FAILED update.`);
            }

            ReportDownloadProcessor.LOGGER.error(`Report request ${request.id} FAILED: ${message}`);
        } finally {
            clearInterval(heartbeat);
        }
    }

    private generateFile(request: ReportDownloadRequest, params: Record<string, string>) {
        switch (request.reportType) {
            case ReportType.TransactionDetail:
                return this.transactionReportGenerator.generate(request, params);
            default:
                throw new Error(`Unsupported report type: ${request.reportType}`);
        }
    }

    private startHeartbeat(requestId: string): NodeJS.Timeout {
        return setInterval(() => {
            void this.reportDownloadRepository.touchRunning(requestId)
                .catch((error: unknown) => {
                    ReportDownloadProcessor.LOGGER.warn(
                        `Could not heartbeat report request ${requestId}: ${ReportDownloadProcessor.errorMessage(error)}`,
                    );
                });
        }, Math.min(ReportDownloadProcessor.HEARTBEAT_INTERVAL_MS, Math.max(1000, Math.floor(this.settings.staleRunningTtlMs / 3))));
    }

    private static errorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }
}

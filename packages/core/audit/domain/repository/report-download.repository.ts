import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {createHash} from 'crypto';
import {Snowflake} from '@shared/snowflake';
import {DbTarget} from '@shared/typeorm';
import {LessThan, MoreThanOrEqual, Repository} from 'typeorm';
import {ReportDownloadRequest, ReportDownloadRequestParam, ReportDownloadStatus, ReportType} from '../model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class ReportDownloadRepository {

    private static readonly SNOWFLAKE = Snowflake.get();
    private static readonly MAX_CLAIM_ATTEMPTS = 10;
    private static readonly MAX_ERROR_LENGTH = 1000;

    constructor(
        @InjectRepository(ReportDownloadRequest, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRequestRepository: Repository<ReportDownloadRequest>,
        @InjectRepository(ReportDownloadRequest, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRequestRepository: Repository<ReportDownloadRequest>,
        @InjectRepository(ReportDownloadRequestParam, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeParamRepository: Repository<ReportDownloadRequestParam>,
        @InjectRepository(ReportDownloadRequestParam, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readParamRepository: Repository<ReportDownloadRequestParam>,
    ) {
    }

    async createPending(input: ReportDownloadRepository.CreatePendingInput): Promise<ReportDownloadRequest> {
        const now = new Date();
        const request = this.writeRequestRepository.create({
            id:                 ReportDownloadRepository.SNOWFLAKE.nextId().toString(),
            reportType:         input.reportType,
            paramsSignature:    ReportDownloadRepository.signature(input.reportType, input.fileType, input.params),
            status:             ReportDownloadStatus.Pending,
            fileType:           input.fileType,
            fileKey:            null,
            errorMessage:       null,
            requestedByUserId:  input.requestedByUserId ?? null,
            requestedByFspId:   input.requestedByFspId ?? null,
            finishedAt:         null,
            createdAt:          now,
            updatedAt:          now,
        });

        await this.writeRequestRepository.manager.transaction(async (entityManager) => {
            await entityManager.save(request);

            const params = Object.entries(input.params).map(([key, value]) => this.writeParamRepository.create({
                id:         ReportDownloadRepository.SNOWFLAKE.nextId().toString(),
                requestId:  request.id,
                paramKey:   key,
                paramValue: value,
                createdAt:  now,
            }));

            if (params.length > 0) {
                await entityManager.save(params);
            }
        });

        return request;
    }

    async findById(
        requestId: string,
        accessScope?: ReportDownloadRepository.AccessScope,
        target: DbTarget = DbTarget.Read,
    ): Promise<ReportDownloadRequest | null> {
        const where: Record<string, unknown> = {id: requestId};

        if (accessScope?.fspId != null) {
            where.requestedByFspId = accessScope.fspId;
        }

        return this.requestRepository(target).findOne({where});
    }

    async findParamsByRequestId(requestId: string, target: DbTarget = DbTarget.Read): Promise<Record<string, string>> {
        const params = await this.paramRepository(target).find({where: {requestId}});
        const result: Record<string, string> = {};

        for (const param of params) {
            result[param.paramKey] = param.paramValue ?? '';
        }

        return result;
    }

    async claimNextPending(): Promise<ReportDownloadRequest | null> {
        for (let attempt = 0; attempt < ReportDownloadRepository.MAX_CLAIM_ATTEMPTS; attempt++) {
            const request = await this.writeRequestRepository.findOne({
                where: {status: ReportDownloadStatus.Pending},
                order: {createdAt: 'ASC'},
            });

            if (request == null) {
                return null;
            }

            const now = new Date();
            const result = await this.writeRequestRepository.update(
                {id: request.id, status: ReportDownloadStatus.Pending},
                {status: ReportDownloadStatus.Running, updatedAt: now},
            );

            if (result.affected === 1) {
                request.status = ReportDownloadStatus.Running;
                request.updatedAt = now;
                return request;
            }
        }

        return null;
    }

    async countFreshRunning(staleBefore: Date): Promise<number> {
        return this.readRequestRepository.count({
            where: {
                status:    ReportDownloadStatus.Running,
                updatedAt: MoreThanOrEqual(staleBefore),
            },
        });
    }

    async touchRunning(requestId: string): Promise<boolean> {
        const result = await this.writeRequestRepository.update(
            {id: requestId, status: ReportDownloadStatus.Running},
            {updatedAt: new Date()},
        );

        return result.affected === 1;
    }

    async markReady(requestId: string, fileKey: string): Promise<boolean> {
        const now = new Date();
        const result = await this.writeRequestRepository.update(
            {id: requestId, status: ReportDownloadStatus.Running},
            {
                status:       ReportDownloadStatus.Ready,
                fileKey,
                errorMessage: null,
                finishedAt:   now,
                updatedAt:    now,
            },
        );

        return result.affected === 1;
    }

    async markFailed(requestId: string, errorMessage: string): Promise<boolean> {
        const now = new Date();
        const result = await this.writeRequestRepository.update(
            {id: requestId, status: ReportDownloadStatus.Running},
            {
                status:       ReportDownloadStatus.Failed,
                errorMessage: ReportDownloadRepository.trimError(errorMessage),
                finishedAt:   now,
                updatedAt:    now,
            },
        );

        return result.affected === 1;
    }

    async failStaleRunning(staleBefore: Date): Promise<number> {
        const now = new Date();
        const result = await this.writeRequestRepository.update(
            {
                status:    ReportDownloadStatus.Running,
                updatedAt: LessThan(staleBefore),
            },
            {
                status:       ReportDownloadStatus.Failed,
                errorMessage: 'Auto-recovered stale RUNNING request after restart/error',
                finishedAt:   now,
                updatedAt:    now,
            },
        );

        return result.affected ?? 0;
    }

    private requestRepository(target: DbTarget): Repository<ReportDownloadRequest> {
        return target === DbTarget.Write ? this.writeRequestRepository : this.readRequestRepository;
    }

    private paramRepository(target: DbTarget): Repository<ReportDownloadRequestParam> {
        return target === DbTarget.Write ? this.writeParamRepository : this.readParamRepository;
    }

    private static signature(reportType: ReportType, fileType: string, params: Record<string, string>): string {
        return createHash('sha256')
            .update(JSON.stringify({reportType, fileType, params: ReportDownloadRepository.sortObject(params)}))
            .digest('hex');
    }

    private static sortObject(input: Record<string, string>): Record<string, string> {
        return Object.keys(input)
            .sort()
            .reduce<Record<string, string>>((result, key) => {
                result[key] = input[key];
                return result;
            }, {});
    }

    private static trimError(message: string): string {
        return message.length > ReportDownloadRepository.MAX_ERROR_LENGTH
            ? message.slice(0, ReportDownloadRepository.MAX_ERROR_LENGTH)
            : message;
    }
}

export namespace ReportDownloadRepository {

    export type AccessScope = {
        fspId: string;
    };

    export type CreatePendingInput = {
        reportType: ReportType;
        fileType: string;
        params: Record<string, string>;
        requestedByUserId?: string | null;
        requestedByFspId?: string | null;
    };
}

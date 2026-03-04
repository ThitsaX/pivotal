import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Post,
} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {AuditOutboundPartiesCommand} from '@core/audit/domain';
import {OutboundPartiesAuditPublisher} from '@core/audit/producer';
import {DoLookupCommand} from '@core/outbound/domain';
import {
    ErrorInformationObject,
    FspiopErrors,
    FspiopException,
    PartiesTypeIDPutResponse,
    PartyIdType,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';

@Controller('lookup')
export class LookupController {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        private readonly commandBus: CommandBus,
        private readonly auditPublisher: OutboundPartiesAuditPublisher,
    ) {
    }

    @Post()
    @HttpCode(HttpStatus.OK)
    async lookup(@Body() request: LookupController.Request): Promise<LookupController.Response> {
        const createdAt = new Date();
        const id = LookupController.nextAuditId();

        try {
            const input = new DoLookupCommand.Input(
                request.correlationId,
                request.source,
                request.destination,
                request.type,
                request.id,
                request.subId,
            );

            const output: DoLookupCommand.Output = await this.commandBus.execute(
                new DoLookupCommand(input),
            );

            await this.auditPublisher.publish(
                new AuditOutboundPartiesCommand.Input(
                    id,
                    LookupController.RAIL,
                    request.source,
                    request.destination,
                    request.correlationId,
                    request.type,
                    request.id,
                    request.subId ?? null,
                    output.response,
                    null,
                    createdAt,
                    new Date(),
                ),
            );

            return new LookupController.Response(output.response);
        } catch (error) {
            try {
                await this.auditPublisher.publish(
                    new AuditOutboundPartiesCommand.Input(
                        id,
                        LookupController.RAIL,
                        request.source,
                        request.destination,
                        request.correlationId,
                        request.type,
                        request.id,
                        request.subId ?? null,
                        null,
                        LookupController.toAuditError(error),
                        createdAt,
                        new Date(),
                    ),
                );
            } finally {
                throw error;
            }
        }
    }

    private static toAuditError(error: unknown): ErrorInformationObject {
        if (error instanceof FspiopException) {
            return error.toErrorObject();
        }

        const message = error instanceof Error
            ? error.message
            : FspiopErrors.INTERNAL_SERVER_ERROR.description;

        return new FspiopException(FspiopErrors.INTERNAL_SERVER_ERROR, message).toErrorObject();
    }

    private static nextAuditId(): string {
        return LookupController.SNOWFLAKE.nextId().toString();
    }
}

export namespace LookupController {

    export class Request {
        correlationId!: string;
        source!: string;
        destination!: string;
        type!: PartyIdType;
        id!: string;
        subId?: string;
    }

    export class Response {
        constructor(public readonly response: PartiesTypeIDPutResponse) {
        }
    }
}

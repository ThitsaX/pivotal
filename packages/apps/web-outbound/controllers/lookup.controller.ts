import {Body, Controller, Headers, HttpCode, HttpStatus, Post,} from '@nestjs/common';
import {ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiProperty, ApiTags} from '@nestjs/swagger';
import {CommandBus} from '@nestjs/cqrs';
import {AuditOutboundPartiesCommand} from '@core/audit/domain';
import {OutboundPartiesAuditPublisher} from '@core/audit/producer';
import {DoLookupCommand} from '@core/outbound/domain';
import {ErrorInformationObject, FspiopErrors, FspiopException, FspiopHeaders, PartiesTypeIDPutResponse, PartyIdType,} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {ApiFspiopErrorResponses} from './fspiop-error-responses.decorator';

export class LookupRequest {
    @ApiProperty({type: String, description: 'End-to-end correlation ID for the request'})
    correlationId!: string;

    @ApiProperty({type: String, description: 'The FSP ID of the destination (payee FSP)'})
    destination!: string;

    @ApiProperty({enum: PartyIdType, enumName: 'PartyIdType', description: 'Party identifier type'})
    type!: PartyIdType;

    @ApiProperty({type: String, description: 'Party identifier value'})
    id!: string;

    @ApiProperty({type: String, required: false, description: 'Party sub-identifier'})
    subId?: string;
}

export class LookupResponse {
    @ApiProperty({type: () => PartiesTypeIDPutResponse, description: 'FSPIOP PUT /parties response payload'})
    readonly response: PartiesTypeIDPutResponse;

    constructor(response: PartiesTypeIDPutResponse) {
        this.response = response;
    }
}

@ApiTags('Lookup')
@Controller('lookup')
export class LookupController {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        private readonly commandBus: CommandBus,
        private readonly auditPublisher: OutboundPartiesAuditPublisher,
    ) {
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

    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({summary: 'Perform a party lookup via FSPIOP'})
    @ApiHeader({name: FspiopHeaders.Names.FSPIOP_SOURCE, required: true, description: 'The FSP ID of the requester'})
    @ApiBody({type: LookupRequest})
    @ApiOkResponse({type: LookupResponse})
    @ApiFspiopErrorResponses()
    async lookup(
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) source: string,
        @Body() request: LookupRequest,
    ): Promise<LookupResponse> {
        const createdAt = new Date();
        const id = LookupController.nextAuditId();

        try {
            const input = new DoLookupCommand.Input(
                request.correlationId,
                source,
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
                    source,
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

            return new LookupResponse(output.response);
        } catch (error) {
            try {
                await this.auditPublisher.publish(
                    new AuditOutboundPartiesCommand.Input(
                        id,
                        LookupController.RAIL,
                        source,
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
}

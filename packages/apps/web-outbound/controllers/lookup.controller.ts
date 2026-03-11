import {Body, Controller, Headers, HttpCode, HttpStatus, Inject, Post,} from '@nestjs/common';
import {ApiBearerAuth, ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiProperty, ApiTags} from '@nestjs/swagger';
import {CommandBus} from '@nestjs/cqrs';
import {AuditOutboundPartiesCommand} from '@core/audit/domain';
import {OutboundPartiesAuditPublisher} from '@core/audit/producer';
import {DoLookupCommand} from '@core/outbound/domain';
import {ErrorInformationObject, ErrorInformationResponse, FspiopErrors, FspiopException, FspiopHeaders, PartiesTypeIDPutResponse, PartyIdType,} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {validateAuthorizationHeader} from './authorization-header.util';
import {ApiFspiopErrorResponses} from './fspiop-error-responses.decorator';

export class LookupRequest {
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
    private static readonly FALLBACK_ERROR = FspiopErrors.INTERNAL_SERVER_ERROR.toErrorObject();

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
        @Inject(OutboundPartiesAuditPublisher)
        private readonly auditPublisher: OutboundPartiesAuditPublisher,
    ) {
    }

    private static toAuditErrorResponse(error: unknown): ErrorInformationResponse {
        const response = new ErrorInformationResponse();

        if (error instanceof FspiopException) {
            response.errorInformation = error.toErrorObject().errorInformation;
            return response;
        }

        const message = error instanceof Error
            ? error.message
            : FspiopErrors.INTERNAL_SERVER_ERROR.description;

        response.errorInformation = new FspiopException(FspiopErrors.INTERNAL_SERVER_ERROR, message).toErrorObject().errorInformation;
        return response;
    }

    private static toErrorInformationObject(response: ErrorInformationResponse): ErrorInformationObject {
        return {
            errorInformation: response.errorInformation ?? LookupController.FALLBACK_ERROR.errorInformation,
        };
    }

    private static nextAuditId(): string {
        return LookupController.SNOWFLAKE.nextId().toString();
    }

    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({summary: 'Perform a party lookup via FSPIOP'})
    @ApiHeader({name: FspiopHeaders.Names.FSPIOP_SOURCE, required: true, description: 'The FSP ID of the requester'})
    @ApiHeader({name: 'authorization', required: true, description: 'Bearer RS256 JWT for API authentication'})
    @ApiBearerAuth('authorization')
    @ApiBody({type: LookupRequest})
    @ApiOkResponse({type: LookupResponse})
    @ApiFspiopErrorResponses()
    async lookup(
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) source: string,
        @Headers('authorization') authorization: string | undefined,
        @Body() request: LookupRequest,
    ): Promise<LookupResponse> {
        validateAuthorizationHeader(authorization);

        const createdAt = new Date();
        const id = LookupController.nextAuditId();

        try {
            const input = new DoLookupCommand.Input(
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
            const errorResponse = LookupController.toAuditErrorResponse(error);
            const errorObject = LookupController.toErrorInformationObject(errorResponse);

            try {
                await this.auditPublisher.publish(
                    new AuditOutboundPartiesCommand.Input(
                        id,
                        LookupController.RAIL,
                        source,
                        request.destination,
                        request.type,
                        request.id,
                        request.subId ?? null,
                        null,
                        errorObject,
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

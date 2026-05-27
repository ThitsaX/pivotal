import { Body, Controller, Headers, Inject, Logger, Param, Post, Put } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Transform } from 'class-transformer';
import { FSPIOP_AMOUNT_PATTERN, normalizeFspiopAmount, PostSendMoneyCommand, PutAcceptPartyCommand, PutAcceptQuoteCommand, SendMoneyRequest, SendMoneyResponse, } from '@core/outbound/domain';
import { FspiopErrors, FspiopException, FspiopHeaders, } from '@shared/fspiop';
import { Ulid } from "@shared/ulid";
import {
    IsOptional,
    IsBoolean,
    Validate,
    ValidateIf,
    ValidationArguments,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({name: 'acceptPartyAmount', async: false})
class AcceptPartyAmountConstraint implements ValidatorConstraintInterface {
    validate(value: unknown): boolean {
        if (typeof value !== 'string') {
            return false;
        }

        const amount = normalizeFspiopAmount(value);

        return amount.length > 0 && FSPIOP_AMOUNT_PATTERN.test(amount);
    }

    defaultMessage(args: ValidationArguments): string {
        const value = args.value;

        if (value == null || (typeof value === 'string' && normalizeFspiopAmount(value).length === 0)) {
            return 'amount is required when acceptParty is provided';
        }

        if (typeof value !== 'string') {
            return 'amount must be a string';
        }

        return 'amount must be a valid FSPIOP Amount';
    }
}

export class PutSendMoneyRequest {
    @IsOptional()
    @Transform(({ value }) => value === true || value === 'true')
    @IsBoolean()
    acceptParty?: boolean;

    @ValidateIf((request: PutSendMoneyRequest) => request.acceptParty != null)
    @Transform(({ value }) => typeof value === 'string' ? normalizeFspiopAmount(value) : value)
    @Validate(AcceptPartyAmountConstraint)
    amount?: string;

    @IsOptional()
    @Transform(({ value }) => value === true || value === 'true')
    @IsBoolean()
    acceptQuote?: boolean;
}

@Controller('secured/sendmoney')
export class SendMoneyController {

    private readonly logger = new Logger(SendMoneyController.name);

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
    ) {
    }

    private static toSource(source: string | undefined, request: SendMoneyRequest): string {
        const normalizedSource = source?.trim();

        if (normalizedSource != null && normalizedSource.length > 0) {
            return normalizedSource;
        }

        const payerFsp = request.from?.fspId?.trim();

        if (payerFsp == null || payerFsp.length === 0) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'fspiop-source header or request.from.fspId is required.',
            );
        }

        return payerFsp;
    }

    @Post()
    async post(
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) source: string,
        @Body() request: SendMoneyRequest,
    ): Promise<SendMoneyResponse> {

        this.logger.log(
            `Post SendMoney Request for fromIdValue ${request.from?.idValue} toIdValue ${request.to?.idValue} : ${JSON.stringify(request)}`,
        );
        const correlationId = Ulid.generate();
        const payerFsp = SendMoneyController.toSource(source, request);
        const input = new PostSendMoneyCommand.Input(correlationId, payerFsp, request);

        const output: PostSendMoneyCommand.Output = await this.commandBus.execute(
            new PostSendMoneyCommand(input),
        );

        this.logger.log(`Post SendMoney Response for TransferId ${output.response.transferId} : ${JSON.stringify(output.response)}`);

        return output.response;
    }

    @Put(':transferId')
    async put(
        @Param('transferId') transferId: string,
        @Body() request: PutSendMoneyRequest,
    ): Promise<SendMoneyResponse> {
        if (request.acceptParty != null) {
            this.logger.log(
                `Put SendMoney Accept Party Request for TransferId ${transferId} : ${JSON.stringify(request)}`,
            );
            const output: PutAcceptPartyCommand.Output = await this.commandBus.execute(
                new PutAcceptPartyCommand(
                    new PutAcceptPartyCommand.Input(transferId, request.acceptParty, request.amount ?? ''),
                ),
            );
            this.logger.log(
                `Put SendMoney Accept Party Response for TransferId ${transferId} : ${JSON.stringify(output)}`,
            );
            return output.response;
        }

        if (request.acceptQuote != null) {
            this.logger.log(
                `Put SendMoney Accept Quote Request for TransferId ${transferId} : ${JSON.stringify(request)}`,
            );
            const output: PutAcceptQuoteCommand.Output = await this.commandBus.execute(
                new PutAcceptQuoteCommand(
                    new PutAcceptQuoteCommand.Input(transferId, request.acceptQuote),
                ),
            );
            this.logger.log(
                `Put SendMoney Accept Quote Response for TransferId ${transferId} : ${JSON.stringify(output)}`,
            );
            return output.response;
        }

        throw new FspiopException(
            FspiopErrors.MISSING_MANDATORY_ELEMENT,
            {
                extension: [
                    {
                        key: '',
                        value: 'acceptParty or acceptQuote is required.',
                    },
                ],
            },
        );
    }
}

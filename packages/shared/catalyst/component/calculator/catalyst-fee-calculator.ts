// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Logger} from '@nestjs/common';
import {Currency, Money} from '@shared/fspiop';
import {
    CalculateFeeByFeePolicyIdInput,
    CalculateFeeInput,
    FeeCalculationResult,
} from '../../dto';
import {CatalystException} from '../../exception';
import {CatalystAxios} from '../catalyst-axios';
import {FeeCalculator} from '../fee-calculator';

export class CatalystFeeCalculator extends FeeCalculator {

    private readonly logger = new Logger(CatalystFeeCalculator.name);

    constructor(
        private readonly catalystAxios: CatalystAxios,
    ) {
        super();
    }

    async calculate(scenario: string, amount: Money): Promise<FeeCalculationResult>;

    async calculate(policyId: bigint, amount: Money): Promise<FeeCalculationResult>;

    async calculate(scenarioOrPolicyId: string | bigint, amount: Money): Promise<FeeCalculationResult> {
        if (typeof scenarioOrPolicyId === 'string') {
            return this.calculateByScenario(scenarioOrPolicyId, amount);
        }

        return this.calculateByFeePolicyId(scenarioOrPolicyId, amount);
    }

    private async calculateByScenario(scenario: string, amount: Money): Promise<FeeCalculationResult> {
        const request = new CalculateFeeInput();
        request.amount = amount.amount;
        request.currency = amount.currency as unknown as Currency;
        request.scenario = scenario;

        try {
            const response = await this.catalystAxios.calculateFee(request);

            return response.feeCalculationResultData ?? new FeeCalculationResult();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const stack = error instanceof Error ? error.stack : undefined;

            this.logger.error(`calculateByScenario failed for scenario=${scenario}`, stack ?? message);
            CatalystFeeCalculator.rethrowAsCatalystException(error);
            throw error;
        }
    }

    private async calculateByFeePolicyId(policyId: bigint, amount: Money): Promise<FeeCalculationResult> {
        const request = new CalculateFeeByFeePolicyIdInput();
        request.amount = amount.amount;
        request.feePolicyId = policyId.toString();

        try {
            const response = await this.catalystAxios.calculateFeeWithPolicyId(request);

            return response.feeCalculationResultData ?? new FeeCalculationResult();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const stack = error instanceof Error ? error.stack : undefined;

            this.logger.error(`calculateByFeePolicyId failed for feePolicyId=${policyId.toString()}`, stack ?? message);
            CatalystFeeCalculator.rethrowAsCatalystException(error);
            throw error;
        }
    }

    private static rethrowAsCatalystException(error: unknown): void {

        if (error instanceof CatalystException) {
            throw error;
        }

        const message = error instanceof Error && error.message.trim().length > 0
            ? error.message
            : 'Unexpected catalyst error.';

        throw new CatalystException('CATALYST_ERROR', message);
    }
}

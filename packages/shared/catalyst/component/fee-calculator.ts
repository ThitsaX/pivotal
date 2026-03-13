import {Money} from '@shared/fspiop';
import {FeeCalculationResult} from '../dto';

export abstract class FeeCalculator {

    abstract calculate(scenario: string, amount: Money): Promise<FeeCalculationResult>;

    abstract calculate(policyId: bigint, amount: Money): Promise<FeeCalculationResult>;
}

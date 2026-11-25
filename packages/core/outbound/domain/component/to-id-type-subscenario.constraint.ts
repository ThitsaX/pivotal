// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {
    ValidationArguments,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import {PartyIdType, SubScenario} from '@shared/fspiop';
import {FspParty} from '../dto/fsp-party';

/**
 * When enabled, requires payee `to.idType` to match `subScenario`
 * (P2P → MSISDN|ACCOUNT_ID; P2B → BUSINESS). SubScenarios without a
 * defined rule are not restricted. Does not check `from.idType`.
 * Off unless VALIDATE_TO_IDTYPE_BY_SUBSCENARIO=true.
 */
@ValidatorConstraint({name: 'toIdTypeMatchesSubScenario', async: false})
export class ToIdTypeSubScenarioConstraint implements ValidatorConstraintInterface {

    private static readonly ALLOWED_TO_ID_TYPES: Readonly<Record<string, readonly PartyIdType[]>> = {
        [SubScenario.personToPerson]: [PartyIdType.Msisdn, PartyIdType.AccountId],
        [SubScenario.personToBusiness]: [PartyIdType.Business],
    };

    constructor(private readonly enabled = false) {
    }

    validate(value: unknown, args: ValidationArguments): boolean {
        if (!this.enabled) {
            return true;
        }

        const subScenario = (args.object as {subScenario?: string}).subScenario?.trim();
        if (subScenario == null || subScenario.length === 0) {
            return true;
        }

        const allowed = ToIdTypeSubScenarioConstraint.ALLOWED_TO_ID_TYPES[subScenario];
        if (allowed == null) {
            return true;
        }

        const idType = (value as FspParty | undefined)?.idType;
        if (idType == null) {
            return true;
        }

        return allowed.includes(idType);
    }

    defaultMessage(): string {
        return 'to.idType does not match the specified subScenario';
    }
}

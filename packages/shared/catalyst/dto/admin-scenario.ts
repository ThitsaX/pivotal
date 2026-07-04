// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ApiProperty} from '@nestjs/swagger';
import {Currency} from '@shared/fspiop';

export class PolicySchedule {

    @ApiProperty({type: String, required: false})
    feePolicyId?: string;

    @ApiProperty({type: String, required: false})
    policyScheduleId?: string;

    @ApiProperty({type: String, required: false})
    scenarioId?: string;

    @ApiProperty({type: String, required: false})
    startAt?: string;
}

export class AddPolicyScheduleInput {

    @ApiProperty({type: String, required: false})
    feePolicyId?: string;

    @ApiProperty({type: String, required: false})
    scenarioId?: string;

    @ApiProperty({type: String, required: false})
    startAt?: string;
}

export class AddPolicyScheduleOutput {

    @ApiProperty({type: String, required: false})
    policyScheduleId?: string;
}

export class RemovePolicyScheduleInput {

    @ApiProperty({type: String, required: false})
    policyScheduleId?: string;

    @ApiProperty({type: String, required: false})
    scenarioId?: string;
}

export class RemovePolicyScheduleOutput {

    @ApiProperty({type: Boolean, required: false})
    removed?: boolean;
}

export class CreateScenarioInput {

    @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
    currency?: Currency;

    @ApiProperty({type: String, required: false})
    description?: string;

    @ApiProperty({type: String, required: false})
    name?: string;
}

export class CreateScenarioOutput {

    @ApiProperty({type: String, required: false})
    scenarioId?: string;
}

export class ScenarioIdInput {

    @ApiProperty({type: String, required: false})
    scenarioId?: string;
}

export class ScenarioSummary {

    @ApiProperty({type: Boolean, required: false})
    active?: boolean;

    @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
    currency?: Currency;

    @ApiProperty({type: String, required: false})
    id?: string;

    @ApiProperty({type: String, required: false})
    name?: string;
}

export class Scenario extends ScenarioSummary {

    @ApiProperty({type: String, required: false})
    description?: string;

    @ApiProperty({type: () => PolicySchedule, isArray: true, required: false})
    policySchedules?: Array<PolicySchedule>;
}

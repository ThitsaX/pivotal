// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {BadRequestException} from '@nestjs/common';

type EnumType = Record<string, string>;

export class QueryParamsUtil {

    private static readonly TRUE_VALUES = new Set(['true', '1', 'yes']);
    private static readonly FALSE_VALUES = new Set(['false', '0', 'no']);

    static toOptionalString(value: string | undefined): string | undefined {
        const normalized = value?.trim();

        if (normalized == null || normalized.length === 0) {
            return undefined;
        }

        return normalized;
    }

    static toOptionalNullableString(value: string | undefined): string | null | undefined {
        const normalized = QueryParamsUtil.toOptionalString(value);

        if (normalized == null) {
            return undefined;
        }

        if (normalized.toLowerCase() === 'null') {
            return null;
        }

        return normalized;
    }

    static toOptionalDate(value: string | undefined, parameterName: string): Date | undefined {
        const normalized = QueryParamsUtil.toOptionalString(value);

        if (normalized == null) {
            return undefined;
        }

        const parsed = new Date(normalized);

        if (Number.isNaN(parsed.getTime())) {
            throw new BadRequestException(`${parameterName} must be a valid ISO datetime.`);
        }

        return parsed;
    }

    static toOptionalBoolean(value: string | undefined, parameterName: string): boolean | undefined {
        const normalized = QueryParamsUtil.toOptionalString(value);

        if (normalized == null) {
            return undefined;
        }

        const lowered = normalized.toLowerCase();

        if (QueryParamsUtil.TRUE_VALUES.has(lowered)) {
            return true;
        }

        if (QueryParamsUtil.FALSE_VALUES.has(lowered)) {
            return false;
        }

        throw new BadRequestException(`${parameterName} must be true/false.`);
    }

    static toOptionalEnum<T extends EnumType>(
        value: string | undefined,
        enumType: T,
        parameterName: string,
    ): T[keyof T] | undefined {
        const normalized = QueryParamsUtil.toOptionalString(value);

        if (normalized == null) {
            return undefined;
        }

        const enumValues = Object.values(enumType) as string[];

        if (enumValues.includes(normalized)) {
            return normalized as T[keyof T];
        }

        throw new BadRequestException(`${parameterName} must be one of: ${enumValues.join(', ')}.`);
    }

    static toEnum<T extends EnumType>(
        value: string | undefined,
        enumType: T,
        fallback: T[keyof T],
        parameterName: string,
    ): T[keyof T] {
        const parsed = QueryParamsUtil.toOptionalEnum(value, enumType, parameterName);

        return parsed ?? fallback;
    }

    static toNonNegativeInteger(value: string | undefined, fallback: number, parameterName: string): number {
        const normalized = QueryParamsUtil.toOptionalString(value);

        if (normalized == null) {
            return fallback;
        }

        const parsed = Number(normalized);

        if (!Number.isInteger(parsed) || parsed < 0) {
            throw new BadRequestException(`${parameterName} must be a non-negative integer.`);
        }

        return parsed;
    }

    static toPositiveInteger(value: string | undefined, fallback: number, parameterName: string): number {
        const normalized = QueryParamsUtil.toOptionalString(value);

        if (normalized == null) {
            return fallback;
        }

        const parsed = Number(normalized);

        if (!Number.isInteger(parsed) || parsed <= 0) {
            throw new BadRequestException(`${parameterName} must be a positive integer.`);
        }

        return parsed;
    }

    static toOptionalInteger(value: string | undefined, parameterName: string): number | undefined {
        const normalized = QueryParamsUtil.toOptionalString(value);

        if (normalized == null) {
            return undefined;
        }

        const parsed = Number(normalized);

        if (!Number.isInteger(parsed)) {
            throw new BadRequestException(`${parameterName} must be an integer.`);
        }

        return parsed;
    }

    static toDateRange<T>(
        startValue: string | undefined,
        endValue: string | undefined,
        startParameterName: string,
        endParameterName: string,
        createRange: (start?: Date, end?: Date) => T,
    ): T | undefined {
        const start = QueryParamsUtil.toOptionalDate(startValue, startParameterName);
        const end = QueryParamsUtil.toOptionalDate(endValue, endParameterName);

        if (start == null && end == null) {
            return undefined;
        }

        return createRange(start, end);
    }
}

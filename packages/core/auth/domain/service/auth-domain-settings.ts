// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
export const AUTH_DOMAIN_REQUIRED_SETTINGS = Symbol('AuthDomainRequiredSettings');

export interface AuthDomainSettings {

    jwtSecret(): string;

    jwtIssuer(): string;

    accessTokenTtlSeconds(): number;

    refreshTokenTtlDays(): number;

    bcryptCostFactor(): number;

    loginLockoutThreshold(): number;

    loginLockoutDurationMinutes(): number;

    adminSeedEmail(): string;

    adminSeedTempPassword(): string;
}

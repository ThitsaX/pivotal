// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export interface RegisterMsisdnRequest {
    requestId: string;
    msisdn: string;
    otpReference: string;
    otp: string;
    [key: string]: unknown;
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {FspiopException} from '../../../packages/shared/fspiop/exception/fspiop-exception';
import {ApiType} from '../../../packages/shared/iso20022/api-type';
import {Iso20022ContentType, Iso20022Resource} from '../../../packages/shared/iso20022/iso20022-content-type';

const resource = Iso20022Resource.Quotes;
const header = (mode: ApiType): string => Iso20022ContentType.forResource(resource, mode);
const rejectsWith = (fn: () => void, code: string): void => {
    assert.throws(fn, error => error instanceof FspiopException
        && error.errorDefinition.errorType.code === code);
};

describe('Inbound representation headers', () => {
    for (const mode of [ApiType.FSPIOP, ApiType.ISO20022]) {
        describe(mode, () => {
            const valid = header(mode);
            const validate = (contentType: string | string[] | undefined, accept: string | string[] | undefined = valid, method = 'POST'): void => {
                Iso20022ContentType.validateHeaders(resource, mode, method, contentType, accept);
            };

            it('accepts each supported resource in the configured mode', () => {
                for (const target of Object.values(Iso20022Resource)) {
                    const type = Iso20022ContentType.forResource(target, mode);
                    Iso20022ContentType.validateHeaders(target, mode, 'POST', type, type);
                }
            });

            it('parses case, whitespace, quoted versions, parameter order and UTF-8 charset', () => {
                validate(valid.split(';')[0].toUpperCase() + '; Charset=UTF-8; Version="2.0"');
            });

            it('rejects missing Content-Type and required Accept', () => {
                rejectsWith(() => validate(undefined), '3102');
                rejectsWith(() => Iso20022ContentType.validateHeaders(resource, mode, 'POST', valid, undefined), '3102');
            });

            it('rejects fake, generic, mismatched-mode and mismatched-resource media types', () => {
                for (const value of [
                    'application/json',
                    'application/fake-iso20022',
                    valid.replace('quotes', 'transfers'),
                    header(mode === ApiType.ISO20022 ? ApiType.FSPIOP : ApiType.ISO20022),
                    valid.replace('+json', '+xml'),
                ]) {
                    rejectsWith(() => validate(value), '3101');
                    rejectsWith(() => validate(valid, value), '3101');
                }
            });

            it('rejects unsupported versions and malformed or duplicate parameters', () => {
                rejectsWith(() => validate(valid.replace('2.0', '999.0')), '3001');
                for (const value of [valid + ';version=2.0', valid + ';garbage', valid + ';q=1', valid + ';charset=latin1', valid.replace('2.0', 'oops')]) {
                    rejectsWith(() => validate(value), '3101');
                }
                rejectsWith(() => validate([valid, valid]), '3101');
            });

            it('allows callbacks without Accept and validates it when supplied', () => {
                for (const method of ['PUT', 'PATCH']) {
                    Iso20022ContentType.validateHeaders(resource, mode, method, valid, undefined);
                    rejectsWith(() => validate(valid, 'application/json', method), '3101');
                }
            });

            it('allows a bodyless GET without Content-Type but requires a supported Accept', () => {
                validate(undefined, valid, 'GET');
                rejectsWith(() => Iso20022ContentType.validateHeaders(resource, mode, 'GET', undefined, undefined), '3102');
                rejectsWith(() => validate('application/json', valid, 'GET'), '3101');
            });

            it('supports Accept lists and major versions without accepting q=0 or invalid quality', () => {
                validate(valid, [valid.replace('2.0', '999.0') + ';q=0.5', valid.replace('2.0', '2')]);
                rejectsWith(() => validate(valid, valid + ';q=0'), '3001');
                rejectsWith(() => validate(valid, valid + ';q=2'), '3101');
            });
        });
    }

    it('preserves legacy FSPIOP protocol versions but limits ISO to version 2.0', () => {
        for (const version of ['1.0', '1.1', '2.0']) {
            const type = header(ApiType.FSPIOP).replace('2.0', version);
            Iso20022ContentType.validateHeaders(resource, ApiType.FSPIOP, 'POST', type, type);
        }
        const unsupported = header(ApiType.ISO20022).replace('2.0', '1.1');
        rejectsWith(() => Iso20022ContentType.validateHeaders(resource, ApiType.ISO20022, 'POST', unsupported, unsupported), '3001');
    });

    it('detects only supported ISO media types, not arbitrary substrings or versions', () => {
        assert.equal(Iso20022ContentType.isIso20022(header(ApiType.ISO20022)), true);
        for (const value of [undefined, header(ApiType.FSPIOP), 'application/fake-iso20022', header(ApiType.ISO20022).replace('2.0', '999.0')]) {
            assert.equal(Iso20022ContentType.isIso20022(value), false);
        }
    });
});

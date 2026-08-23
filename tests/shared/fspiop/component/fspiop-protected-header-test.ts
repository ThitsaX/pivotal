import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FspiopProtectedHeader } from '../../../../packages/shared/fspiop/component/fspiop-protected-header';
import { loadVectors } from './fspiop-jws-vectors';

function inputFrom(vector: ReturnType<typeof loadVectors>['vectors'][number]): FspiopProtectedHeader.Input {
    return {
        method: vector.request.method,
        uri: vector.request.url,
        source: vector.request.headers['fspiop-source'],
        destination: vector.request.headers['fspiop-destination'],
        date: vector.request.headers['date'],
    };
}

describe('FspiopProtectedHeader', () => {

    const vectors = loadVectors();

    for (const vector of vectors.vectors) {

        it(`should build the protected header — ${vector.name}`, () => {
            const fields = FspiopProtectedHeader.build(inputFrom(vector));

            assert.deepEqual(fields, vector.expected.protectedHeader);
        });

        it(`should serialize fields in the signed order — ${vector.name}`, () => {
            // deepEqual ignores key order, but the serialization is what gets signed.
            const serialized = FspiopProtectedHeader.serialize(inputFrom(vector));

            assert.equal(serialized, vector.expected.protectedHeaderJson);
        });
    }

    it('should carry no fields beyond the contract', () => {
        const fields = FspiopProtectedHeader.build({
            method: 'PUT',
            uri: '/quotes/q-1',
            source: 'payeefsp',
            destination: 'payerfsp',
            date: 'Tue, 23 Aug 2026 09:15:00 GMT',
        });

        assert.deepEqual(Object.keys(fields), [
            'alg',
            'FSPIOP-URI',
            'FSPIOP-HTTP-Method',
            'FSPIOP-Source',
            'FSPIOP-Destination',
            'Date',
        ]);
    });

    it('should not emit typ or cty', () => {
        const fields = FspiopProtectedHeader.build({
            method: 'PUT', uri: '/quotes/q-1', source: 'payeefsp',
        });

        assert.equal('typ' in fields, false);
        assert.equal('cty' in fields, false);
    });

    it('should omit conditional fields when blank rather than emitting empty values', () => {
        const fields = FspiopProtectedHeader.build({
            method: 'PUT', uri: '/quotes/q-1', source: 'payeefsp', destination: '  ', date: '',
        });

        assert.equal('FSPIOP-Destination' in fields, false);
        assert.equal('Date' in fields, false);
    });

    it('should default the algorithm to RS256', () => {
        const fields = FspiopProtectedHeader.build({
            method: 'PUT', uri: '/quotes/q-1', source: 'payeefsp',
        });

        assert.equal(fields.alg, 'RS256');
    });

    it('should reject a missing fspiop-source', () => {
        assert.throws(() => FspiopProtectedHeader.build({
            method: 'PUT', uri: '/quotes/q-1', source: '',
        }));
    });

    it('should reject a missing HTTP method', () => {
        assert.throws(() => FspiopProtectedHeader.build({
            method: '', uri: '/quotes/q-1', source: 'payeefsp',
        }));
    });

    it('should propagate the throw from an unrecognised resource path', () => {
        assert.throws(() => FspiopProtectedHeader.build({
            method: 'GET', uri: 'https://hub.example.com/healthz', source: 'payeefsp',
        }));
    });
});

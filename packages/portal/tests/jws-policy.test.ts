import assert from 'node:assert/strict';
import {test} from 'node:test';
import {canEnableSigning, jwsPolicyChanges, type JwsPolicy} from '../src/modules/participant/jws-policy.ts';

const signingTenant: JwsPolicy = {
    fspId:          'DemoDFSP1',
    role:           'self',
    hasPublicKey:   true,
    jwsSignEnabled: true,
    jwsVerifyMode:  'verify-if-present',
};

test('changing only the verify mode leaves signing out of the request', () => {
    const update = jwsPolicyChanges(signingTenant, {jwsSignEnabled: true, jwsVerifyMode: 'require'});

    assert.deepEqual(update, {fspId: 'DemoDFSP1', jwsVerifyMode: 'require'});
});

test('changing only signing leaves the verify mode out of the request', () => {
    const update = jwsPolicyChanges(signingTenant, {jwsSignEnabled: false, jwsVerifyMode: 'verify-if-present'});

    assert.deepEqual(update, {fspId: 'DemoDFSP1', jwsSignEnabled: false});
});

test('both switches are sent when both moved', () => {
    const update = jwsPolicyChanges(signingTenant, {jwsSignEnabled: false, jwsVerifyMode: 'off'});

    assert.deepEqual(update, {fspId: 'DemoDFSP1', jwsSignEnabled: false, jwsVerifyMode: 'off'});
});

test('nothing is sent when nothing moved', () => {
    assert.equal(jwsPolicyChanges(signingTenant, {jwsSignEnabled: true, jwsVerifyMode: 'verify-if-present'}), null);
});

test('signing can be enabled only for a tenant with a key', () => {
    assert.equal(canEnableSigning(signingTenant), true);
    assert.equal(canEnableSigning({...signingTenant, role: 'peer'}), false);
    assert.equal(canEnableSigning({...signingTenant, hasPublicKey: false}), false);
});

import { generateKeyPairSync } from 'node:crypto';

const keyPair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: {
        format: 'pem',
        type: 'pkcs8',
    },
    publicKeyEncoding: {
        format: 'pem',
        type: 'spki',
    },
});

export const TEST_PRIVATE_KEY_PEM = keyPair.privateKey;

export const TEST_PUBLIC_KEY_PEM = keyPair.publicKey;

export const TEST_PRIVATE_KEY_ENV_VALUE = TEST_PRIVATE_KEY_PEM.replace(/\n/g, '\\n');

export const TEST_PUBLIC_KEY_ENV_VALUE = TEST_PUBLIC_KEY_PEM.replace(/\n/g, '\\n');

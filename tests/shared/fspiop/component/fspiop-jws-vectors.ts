import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Loader for the shared FSPIOP JWS conformance vectors.
 *
 * The JSON file is the artefact the Java connectors execute too — see
 * trust-manager-docs/design/hub-facing-leg.md section A6. Keep this loader thin: any logic added
 * here is logic the Java side will not share.
 */
export interface FspiopJwsVectors {
    algorithm: string;
    vectors: FspiopJwsVectors.Vector[];
    rejects: FspiopJwsVectors.Reject[];
}

export namespace FspiopJwsVectors {

    export interface Vector {
        name: string;
        note: string;
        request: {
            method: string;
            url: string;
            headers: Record<string, string>;
            body: Record<string, unknown>;
        };
        expected: {
            fspiopUri: string;
            protectedHeader: Record<string, string>;
            protectedHeaderJson: string;
            protectedHeaderB64: string;
            payloadJson: string;
            payloadB64: string;
            signingInput: string;
        };
    }

    export interface Reject {
        name: string;
        url: string;
        reason: string;
    }
}

export function loadVectors(): FspiopJwsVectors {
    const file = path.join(__dirname, 'vectors', 'fspiop-jws-vectors.json');
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as FspiopJwsVectors;
}

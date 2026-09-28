import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FspiopUri } from '../../../../packages/shared/fspiop/component/fspiop-uri';
import { loadVectors } from './fspiop-jws-vectors';

describe('FspiopUri', () => {

    const vectors = loadVectors();

    for (const vector of vectors.vectors) {
        it(`should extract the resource path — ${vector.name}`, () => {
            assert.equal(FspiopUri.extract(vector.request.url), vector.expected.fspiopUri);
        });
    }

    for (const reject of vectors.rejects) {
        it(`should throw rather than degrade — ${reject.name}`, () => {
            assert.throws(() => FspiopUri.extract(reject.url));
        });
    }

    it('should strip the query string and fragment', () => {
        assert.equal(
            FspiopUri.extract('https://hub.example.com/quotes/abc-123?trace=1#frag'),
            '/quotes/abc-123',
        );
    });

    it('should accept a bare path without a scheme or host', () => {
        assert.equal(FspiopUri.extract('/transfers/t-1'), '/transfers/t-1');
    });

    it('should normalise a relative path to a leading slash', () => {
        assert.equal(FspiopUri.extract('transfers/t-1'), '/transfers/t-1');
    });

    it('should anchor on the first resource segment when one name contains another', () => {
        // 'transactions' and 'transactionRequests' both start the same way.
        assert.equal(
            FspiopUri.extract('https://hub.example.com/transactionRequests/tr-1'),
            '/transactionRequests/tr-1',
        );
    });

    it('should keep a trailing sub-resource such as /error', () => {
        assert.equal(
            FspiopUri.extract('https://hub.example.com/transfers/t-1/error'),
            '/transfers/t-1/error',
        );
    });

    it('should not match a resource name that is only a substring of a segment', () => {
        assert.throws(() => FspiopUri.extract('https://hub.example.com/myquotes/abc'));
    });
});

# Concurrent party lookups in web-outbound

## How callbacks reach the waiting request today

`FspiopResponseSubscriber` (`packages/shared/fspiop/component/nats/fspiop-response-subscriber.ts`):

- `waitFor(subject)` stores the request's promise in `pending`, keyed by subject.
- `dispatch(msg)` runs for each callback from NATS. It looks up the subject in `pending` and settles that promise.
- If nobody is waiting, the callback goes into a 60-second `recent` cache.

The party lookup subject is:

```
parties:<payerFsp>:<payeeFsp>:<idType>:<idValue>[:<subId>]
e.g. parties:WALLET:BANK:MSISDN:0911
```

This holds everything a `PUT /parties` callback carries (headers and URL path). FSPIOP has no request ID for lookups, so two lookups for the same payee from the same payer FSP **always get the same subject**.

Quotes and transfers are keyed by `quoteId` and `transferId`, so they are not affected.

---

## Problem 1: concurrent lookups for the same payee overwrite each other

`pending` holds **one** entry per subject:

```ts
this.pending.set(successSubject, entry);   // a second call overwrites the first
```

Two requests from the same replica, same payer FSP, same payee:

1. Request A calls `waitFor(K)`, so `pending[K] = A`
2. Request B calls `waitFor(K)`, so `pending[K] = B` (A is lost)
3. The callback arrives and resolves **B only**
4. **A times out after 30 s**, even though the Hub answered

Worse, `cancel(subject)` removes *whatever* is under the key:

- If A's timer fires, or A's `GET /parties` HTTP call fails, it calls `cancel(K)`.
- That deletes **B's** entry and clears **B's** timer.
- B then **hangs with no timeout**.

**When it happens:**
- the same payer sending to the same payee concurrently
- donation events: many payers from one wallet paying one payee
- retries of `POST /sendmoney` (Istio or the client) landing on the same replica

## Problem 2: the recent cache serves another request's party reply

- Every replica receives every callback, because the stream uses LimitsPolicy.
- A replica with no waiter caches the party reply for 60 s.
- The extra callbacks from Problem 1 are cached the same way.
- The next lookup for that payee on that replica takes the cached reply instantly. That reply belongs to another request, and may be an old error such as "party not found".

---

## Solution (subscriber only, plus a small change in three handlers)

### 1. Keep a set of waiters for each subject

```ts
type PendingEntry = {
    readonly successSubject: string;
    readonly subjects: readonly string[];      // success, error, hub error
    readonly resolve: (payload: unknown) => void;
    readonly reject: (error: unknown) => void;
    timer: ReturnType<typeof setTimeout> | null;
};

export type Waiter<T> = {
    readonly promise: Promise<T>;
    cancel(): void;                            // removes THIS waiter only
};

private readonly pending = new Map<string, Set<PendingEntry>>();
```

### 2. `waitFor` adds, never overwrites, and returns a handle

```ts
waitFor<T>(successSubject, errorSubject, hubErrorSubject?, timeoutMs = DEFAULT_TIMEOUT_MS): Waiter<T> {
    let entry!: PendingEntry;

    const promise = guard(new Promise<T>((resolve, reject) => {
        entry = {
            successSubject,
            subjects: [successSubject, errorSubject, ...(hubErrorSubject ? [hubErrorSubject] : [])],
            resolve: payload => resolve(payload as T),
            reject,
            timer: null,
        };

        entry.timer = setTimeout(() => {
            this.remove(entry);                // only itself
            reject(new FspiopException(FspiopErrors.SERVER_TIMED_OUT, `...`));
        }, timeoutMs);

        for (const subject of entry.subjects) {
            let set = this.pending.get(subject);
            if (set == null) {
                set = new Set();
                this.pending.set(subject, set);
            }
            set.add(entry);
        }
    }));

    return {promise, cancel: () => this.remove(entry)};
}

private remove(entry: PendingEntry): void {
    for (const subject of entry.subjects) {
        const set = this.pending.get(subject);
        set?.delete(entry);
        if (set?.size === 0) {
            this.pending.delete(subject);
        }
    }
    if (entry.timer != null) {
        clearTimeout(entry.timer);
        entry.timer = null;
    }
}
```

### 3. `dispatch` settles waiters, not just one

```ts
private dispatch(msg: JsMsg): void {
    const subject = msg.subject;
    const payload = this.nats.codec.decode(msg.data);

    let matched = subject;
    let waiters = this.pending.get(subject);

    if (waiters == null) {
        const anyPayee = FspiopPubSubSubjects.Parties.toAnyPayeeSubject(subject);
        if (anyPayee != null) {
            matched = anyPayee;
            waiters = this.pending.get(anyPayee);
        }
    }

    if (waiters == null || waiters.size === 0) {
        // Party replies are never cached: they cannot be matched to a request,
        // and every replica receives them. Quotes and transfers keep the cache.
        if (FspiopPubSubSubjects.Parties.toAnyPayeeSubject(subject) == null) {
            this.addToRecent(subject, payload);
        }
        return;
    }

    const first = waiters.values().next().value!;   // Set keeps insertion order

    if (matched === first.successSubject) {
        // Same question, same answer: every waiter gets it.
        for (const entry of [...waiters]) {
            this.remove(entry);
            entry.resolve(payload);
        }
    } else {
        // An error may belong to one GET only (e.g. a Hub timeout).
        // Reject the oldest waiter; the others still get their own callback.
        this.remove(first);
        first.reject(toFspiopException(payload as ErrorInformationObject));
    }
}
```

### 4. Handlers use the handle

In `post-send-money.handler.ts`, `put-accept-party.handler.ts` and `put-accept-quote.handler.ts`:

```ts
const waiter = this.subscriber.waitFor<PartiesTypeIDPutResponse>(successSubject, errorSubject, hubErrorSubject);

try {
    await this.fspiopAxios.getParties(partiesUrl, headers, type, id, subId);
} catch (error) {
    waiter.cancel();                 // was: this.subscriber.cancel(successSubject)
    throw error;
}

const callback = await waiter.promise;
```

`onModuleDestroy` removes every entry in every set.

---

## Result

| Case | Today | After |
|---|---|---|
| 2 concurrent lookups, same payee, same replica | first times out after 30 s | both resolve from the first callback |
| One request's GET fails or times out | can delete the other's waiter, which then hangs | removes only its own waiter |
| Hub error for one GET | settles one waiter, the wrong one may be lost | rejects the oldest only; others wait for their own callback |
| Extra or cross-replica party callback | cached and served to the next lookup | dropped |
| Quotes and transfers | unaffected | unaffected (one waiter per key) |

## Why no `traceparent` (or other correlation header) is needed

- Every request on the same subject asked the same question: "who is MSISDN 0911 at BANK, asked by WALLET?" Any callback is a correct answer for all of them, so we never need to know which callback belongs to which request.
- A correlation header only works if **every payee DFSP** echoes it on its `PUT /parties`. FSPIOP does not require that. Other DFSPs, client-owned connectors and queued systems (like the Mojaloop SDK) may send a new trace.
- Without the echo we must fall back to the party subject anyway, which is the code with the bug. So the subscriber fix is needed either way.
- Envoy/Istio and tracing tools rewrite or replace `traceparent`. Transfer matching should not depend on tracing settings.

`traceparent` is still worth adding for end-to-end tracing, as a separate piece of work.

## Tests to add

1. Two waiters on the same subject both resolve from one success callback.
2. `cancel()` on one waiter leaves the other working.
3. One waiter's timeout does not affect the other.
4. An error callback rejects only the oldest waiter; the next waiter resolves from a later success callback.
5. A party callback with no waiter is not cached; quote and transfer callbacks still are.
6. The `_any_` payee fallback still matches with several waiters.

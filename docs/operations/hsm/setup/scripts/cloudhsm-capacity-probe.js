// Measures what one process can sign through a CloudHSM cluster, and answers three questions a
// new cluster raises:
//
//   1. Does the slot lookup find the token without a label?  -- CloudHSM names its own
//   2. What does one signature cost?                         -- it is a network round trip
//   3. How many sessions help before more makes it worse?    -- sizes PKCS11_SESSION_POOL_SIZE
//
// **The answer is per-cluster.** It depends on the network distance between the nodes and the
// HSMs, and on what else is using the cluster. A figure measured elsewhere does not transfer, so
// run this against each new cluster before trusting it with production traffic.
//
// Plain JavaScript on purpose: it needs pkcs11js and nothing else, so it runs in a bare pod
// without this repository, a TypeScript toolchain, or a build.
//
//   npm install pkcs11js
//   PKCS11_PIN='cu_web_outbound:<password>' node cloudhsm-capacity-probe.js
//
// Signs a key that already exists. It creates nothing and deletes nothing.

const pkcs11js = require('pkcs11js');

const MODULE = process.env.PKCS11_MODULE_PATH
    ?? '/opt/cloudhsm/lib/libcloudhsm_pkcs11.so';
const PIN = process.env.PKCS11_PIN;            // 'cu_web_outbound:password'
const LABEL = process.env.PKCS11_KEY_LABEL ?? 'DemoDFSP1-jws-1';
const TOKEN_LABEL = process.env.PKCS11_TOKEN_LABEL ?? '';   // deliberately empty by default
const SIGNS = Number(process.env.PROBE_SIGNS ?? 200);

const PAYLOAD = Buffer.from('probe payload for signing-throughput measurement');

if (!PIN) {
    console.error("Set PKCS11_PIN='cu_web_outbound:<password>'");
    process.exit(1);
}

/**
 * The same rule the session pool applies: a label is optional where the device presents one
 * token, because there the label is the vendor's and not something a deployment chooses.
 */
function findSlot(pkcs11) {
    const slots = pkcs11.C_GetSlotList(true);
    const wanted = TOKEN_LABEL.trim();

    if (wanted.length === 0) {
        if (slots.length === 1) {
            const info = pkcs11.C_GetTokenInfo(slots[0]);
            console.log(`  no label configured, one token present: '${info.label.trim()}' — used`);
            return slots[0];
        }
        throw new Error(`${slots.length} tokens present and no label configured.`);
    }

    for (const slot of slots) {
        if (pkcs11.C_GetTokenInfo(slot).label.trim() === wanted) return slot;
    }
    throw new Error(`No token labelled '${wanted}'.`);
}

/** Records the largest stall in the event loop while `run` is in flight. */
async function withHeartbeat(run) {
    let last = performance.now();
    let maxGapMs = 0;
    let ticks = 0;

    const timer = setInterval(() => {
        const now = performance.now();
        maxGapMs = Math.max(maxGapMs, now - last);
        last = now;
        ticks++;
    }, 5);

    const started = performance.now();
    await run();
    const elapsedMs = performance.now() - started;

    clearInterval(timer);
    return {elapsedMs, maxGapMs, ticks};
}

function report(name, {elapsedMs, maxGapMs, ticks}, count) {
    const perSecond = count / (elapsedMs / 1000);
    const perCall = elapsedMs / count;

    // Judged on tick COUNT: a fully blocked loop never runs the callback, so maxGap stays 0 --
    // reading that as "no stall" reports a total block as perfect responsiveness.
    const expected = Math.floor(elapsedMs / 5);
    const loop = expected < 3 ? 'too short to judge'
        : ticks === 0 ? `BLOCKED for the whole ${elapsedMs.toFixed(0)}ms`
            : ticks < expected / 2 ? 'PARTLY BLOCKED' : 'responsive';

    console.log(`\n${name}`);
    console.log(`  ${count} signatures in ${elapsedMs.toFixed(0)}ms`);
    console.log(`  ${perSecond.toFixed(0)}/sec   ${perCall.toFixed(2)}ms per call`);
    console.log(`  heartbeat: ${ticks} ticks (expected ~${expected}), largest gap ${maxGapMs.toFixed(1)}ms`);
    console.log(`  event loop: ${loop}`);

    return perSecond;
}

function findKey(pkcs11, session, label) {
    pkcs11.C_FindObjectsInit(session, [
        {type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PRIVATE_KEY},
        {type: pkcs11js.CKA_LABEL, value: label},
    ]);
    try {
        const found = pkcs11.C_FindObjects(session, 2);
        if (found.length === 0) throw new Error(`No private key labelled '${label}'.`);
        if (found.length > 1) throw new Error(`More than one key labelled '${label}'.`);
        return found[0];
    } finally {
        pkcs11.C_FindObjectsFinal(session);
    }
}

async function main() {
    const pkcs11 = new pkcs11js.PKCS11();
    pkcs11.load(MODULE);

    // Without this the library may assume single-threaded access, and the async calls below run
    // on libuv's thread pool -- several threads.
    pkcs11.C_Initialize({flags: pkcs11js.CKF_OS_LOCKING_OK});

    console.log(`module: ${MODULE}`);
    console.log(`pkcs11js: ${require('pkcs11js/package.json').version}`);
    console.log(`UV_THREADPOOL_SIZE: ${process.env.UV_THREADPOOL_SIZE ?? '4 (default)'}`);
    console.log('\n--- 1. slot lookup ---');

    const slot = findSlot(pkcs11);

    // Login is a property of the token for the whole application, so one login covers every
    // session opened afterwards.
    const first = pkcs11.C_OpenSession(slot, pkcs11js.CKF_SERIAL_SESSION);
    pkcs11.C_Login(first, pkcs11js.CKU_USER, PIN);

    const key = findKey(pkcs11, first, LABEL);
    console.log(`  key '${LABEL}' resolved`);

    const mech = {mechanism: pkcs11js.CKM_SHA256_RSA_PKCS};
    const out = () => Buffer.alloc(256);

    // ---- 2. one signature, to get the round trip on its own --------------------
    const single = await withHeartbeat(async () => {
        pkcs11.C_SignInit(first, mech, key);
        await pkcs11.C_SignAsync(first, PAYLOAD, out());
    });
    console.log('\n--- 2. a single signature ---');
    console.log(`  ${single.elapsedMs.toFixed(2)}ms round trip`);

    // ---- 3. synchronous, sequential -------------------------------------------
    console.log('\n--- 3. does the synchronous call block? ---');
    const sync = await withHeartbeat(async () => {
        for (let i = 0; i < SIGNS; i++) {
            pkcs11.C_SignInit(first, mech, key);
            pkcs11.C_Sign(first, PAYLOAD, out());
        }
    });
    report('C_Sign — synchronous, sequential', sync, SIGNS);

    // ---- 4. async, sequential --------------------------------------------------
    const seq = await withHeartbeat(async () => {
        for (let i = 0; i < SIGNS; i++) {
            pkcs11.C_SignInit(first, mech, key);
            await pkcs11.C_SignAsync(first, PAYLOAD, out());
        }
    });
    console.log('\n--- 4. one at a time, off the main thread ---');
    const seqRate = report('C_SignAsync — sequential', seq, SIGNS);

    // ---- 5. pooled, at several sizes -------------------------------------------
    // The number that matters. One session carries one operation at a time, so the pool is what
    // allows concurrency at all -- and libuv's thread pool is the ceiling above it.
    console.log('\n--- 5. pooled: where does adding sessions stop helping? ---');

    const rates = {};

    for (const size of [1, 4, 8, 16, 32]) {
        const sessions = [];
        for (let i = 0; i < size; i++) {
            sessions.push(pkcs11.C_OpenSession(slot, pkcs11js.CKF_SERIAL_SESSION));
        }

        const perSession = Math.ceil(SIGNS / size);
        const keyHandles = sessions.map(s => findKey(pkcs11, s, LABEL));

        const pooled = await withHeartbeat(async () => {
            await Promise.all(sessions.map(async (s, idx) => {
                // Sequential within a session, parallel across them: two operations on one
                // session is CKR_OPERATION_ACTIVE.
                for (let i = 0; i < perSession; i++) {
                    pkcs11.C_SignInit(s, mech, keyHandles[idx]);
                    await pkcs11.C_SignAsync(s, PAYLOAD, out());
                }
            }));
        });

        rates[size] = report(`pool of ${size}`, pooled, perSession * size);

        for (const s of sessions) pkcs11.C_CloseSession(s);
    }

    // ---- verdict ----------------------------------------------------------------
    const TARGET = 600;
    const best = Math.max(...Object.values(rates));
    const bestSize = Object.keys(rates).find(k => rates[k] === best);

    console.log('\n=== what this decides ===');
    console.log(`  round trip per signature : ${single.elapsedMs.toFixed(2)}ms`);
    console.log(`  sequential               : ${seqRate.toFixed(0)}/sec`
        + (seqRate < TARGET ? '  <-- below target, so pooling is required, not optional' : ''));
    console.log(`  best pooled              : ${best.toFixed(0)}/sec at pool size ${bestSize}`);
    console.log(`  target                   : ~${TARGET}/sec at 80-100 TPS`);
    console.log(`  headroom                 : ${(best / TARGET).toFixed(1)}x`);
    console.log('\n  If the rate plateaus below the largest pool, the ceiling is');
    console.log('  UV_THREADPOOL_SIZE, not the pool. Re-run with it raised to confirm:');
    console.log(`    UV_THREADPOOL_SIZE=32 PKCS11_PIN='...' node ${require('path').basename(__filename)}`);

    pkcs11.C_Logout(first);
    pkcs11.C_CloseSession(first);
    pkcs11.C_Finalize();
}

main().catch(e => { console.error(`\nprobe failed: ${e.message}`); process.exit(1); });

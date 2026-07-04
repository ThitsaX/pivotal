// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {networkInterfaces} from 'node:os';

export class Snowflake {

    private static readonly EPOCH_BITS = 42;

    private static readonly NODE_ID_BITS = 10;

    private static readonly SEQUENCE_BITS = 12;

    private static readonly MAX_NODE_ID = (1 << Snowflake.NODE_ID_BITS) - 1;

    private static readonly MAX_SEQUENCE = (1 << Snowflake.SEQUENCE_BITS) - 1;

    private static readonly NODE_ID_SHIFT = Snowflake.SEQUENCE_BITS;

    private static readonly TIMESTAMP_SHIFT = Snowflake.NODE_ID_BITS + Snowflake.SEQUENCE_BITS;

    private static readonly BIG_BANG = 1577813400000;

    private static readonly MAX_TIMESTAMP = 2 ** Snowflake.EPOCH_BITS - 1;

    private static readonly INSTANCE = new Snowflake(Snowflake.resolveNodeId());

    private static readonly CRC32_TABLE = Snowflake.createCrc32Table();

    private static readonly PARK_ARRAY = new Int32Array(new SharedArrayBuffer(4));

    private readonly nodeId: number;

    private lastTimestamp = -1;

    private sequence = 0;

    private constructor(nodeId: number) {
        this.nodeId = nodeId & Snowflake.MAX_NODE_ID;
    }

    public static get(): Snowflake {
        return Snowflake.INSTANCE;
    }

    private static createCrc32Table(): Uint32Array {

        const table = new Uint32Array(256);

        for (let i = 0; i < table.length; i += 1) {
            let c = i;

            for (let j = 0; j < 8; j += 1) {
                c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }

            table[i] = c >>> 0;
        }

        return table;
    }

    private static parseMacAddress(macAddress: string): Uint8Array | null {

        const hex = macAddress.trim().toLowerCase();
        const normalized = hex.replace(/[^a-f0-9]/g, '');

        if (normalized.length !== 12) {
            return null;
        }

        const bytes = new Uint8Array(6);

        for (let i = 0; i < 6; i += 1) {
            const pair = normalized.slice(i * 2, i * 2 + 2);
            const value = Number.parseInt(pair, 16);

            if (Number.isNaN(value)) {
                return null;
            }

            bytes[i] = value;
        }

        return bytes;
    }

    private static createNodeIdFromMac(): number {

        try {

            const interfaces = networkInterfaces();
            let crc = 0xffffffff;
            let hasMacAddress = false;

            for (const entries of Object.values(interfaces)) {
                if (!entries) {
                    continue;
                }

                for (const entry of entries) {
                    if (!entry?.mac || entry.mac === '00:00:00:00:00:00') {
                        continue;
                    }

                    const macBytes = Snowflake.parseMacAddress(entry.mac);

                    if (!macBytes) {
                        continue;
                    }

                    hasMacAddress = true;

                    for (const byte of macBytes) {
                        crc = Snowflake.CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
                    }
                }
            }

            if (!hasMacAddress) {
                return Math.floor(Math.random() * 2 ** 31) & Snowflake.MAX_NODE_ID;
            }

            const value = (crc ^ 0xffffffff) >>> 0;

            return value & Snowflake.MAX_NODE_ID;

        } catch {
            return Math.floor(Math.random() * 2 ** 31) & Snowflake.MAX_NODE_ID;
        }
    }

    private static resolveNodeId(): number {

        let configuredNodeId = process.env.SNOWFLAKE_NODE_ID;
        const inK8s = process.env.KUBERNETES_SERVICE_HOST != null;

        if (configuredNodeId != null && configuredNodeId.trim().length > 0) {

            configuredNodeId = configuredNodeId.trim();

            const parsed = Number.parseInt(configuredNodeId, 10);

            if (!Number.isNaN(parsed)) {
                return parsed & Snowflake.MAX_NODE_ID;
            }

            const lastDash = configuredNodeId.lastIndexOf('-');

            if (lastDash >= 0 && lastDash + 1 < configuredNodeId.length) {
                const ordinal = Number.parseInt(
                    configuredNodeId.slice(lastDash + 1),
                    10,
                );

                if (!Number.isNaN(ordinal)) {
                    return ordinal & Snowflake.MAX_NODE_ID;
                }
            }
        }

        if (inK8s) {
            throw new Error(
                'SNOWFLAKE_NODE_ID must be set in Kubernetes to avoid duplicate IDs.',
            );
        }

        return Snowflake.createNodeIdFromMac();
    }

    private static timestamp(): number {
        return Date.now() - Snowflake.BIG_BANG;
    }

    private static waitNextMillis(lastTimestamp: number): number {

        let ts = Snowflake.timestamp();

        while (ts <= lastTimestamp) {
            // Yield the event loop briefly to avoid hot spinning when clocks are tight.
            Atomics.wait(Snowflake.PARK_ARRAY, 0, 0, 0.1);
            ts = Snowflake.timestamp();
        }

        return ts;
    }

    public nextId(): bigint {

        let currentTimestamp = Snowflake.timestamp();

        if (currentTimestamp < this.lastTimestamp) {
            currentTimestamp = Snowflake.waitNextMillis(this.lastTimestamp);
        }

        if (currentTimestamp === this.lastTimestamp) {

            this.sequence = (this.sequence + 1) & Snowflake.MAX_SEQUENCE;

            if (this.sequence === 0) {
                currentTimestamp = Snowflake.waitNextMillis(this.lastTimestamp);
            }

        } else {
            this.sequence = 0;
        }

        if (currentTimestamp > Snowflake.MAX_TIMESTAMP) {
            throw new Error('Snowflake timestamp overflow.');
        }

        this.lastTimestamp = currentTimestamp;

        return (
            (BigInt(currentTimestamp) << BigInt(Snowflake.TIMESTAMP_SHIFT)) |
            (BigInt(this.nodeId) << BigInt(Snowflake.NODE_ID_SHIFT)) |
            BigInt(this.sequence & Snowflake.MAX_SEQUENCE)
        );
    }
}

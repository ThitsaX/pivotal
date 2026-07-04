// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import * as crypto from 'crypto';
import * as IlpPacket from 'ilp-packet';

export interface Prepare {
    base64PreparePacket: string;
    base64Fulfillment: string;
    base64Condition: string;
}

export interface Fulfill {
    valid: boolean;
    base64Fulfillment: string | null;
}

export class Interledger {

    private constructor() {
    }

    static address(peer: string): string {
        return `g.${peer}`;
    }

    static base64Decode(data: string): Buffer {
        return Buffer.from(data, 'base64url');
    }

    static base64Encode(data: Buffer, padding: boolean): string {
        const encoded = data.toString('base64url');
        if (!padding) {
            return encoded;
        }
        const padLength = (4 - (encoded.length % 4)) % 4;
        return encoded + '='.repeat(padLength);
    }

    static prepare(
        ilpSecret: string,
        peer: string,
        amount: bigint,
        data: string,
        expireAt: number,
    ): Prepare {
        const preimage = Interledger.preimage(ilpSecret, amount, peer, data);
        const condition = crypto.createHash('sha256').update(preimage).digest();

        const preparePacket: IlpPacket.IlpPrepare = {
            amount: amount.toString(),
            executionCondition: condition,
            expiresAt: new Date(expireAt),
            destination: peer,
            data: Buffer.from(data, 'utf-8'),
        };

        const serialized = IlpPacket.serializeIlpPrepare(preparePacket);

        return {
            base64PreparePacket: Interledger.base64Encode(serialized, true),
            base64Fulfillment: Interledger.base64Encode(preimage, false),
            base64Condition: Interledger.base64Encode(condition, false),
        };
    }

    static fulfil(
        ilpSecret: string,
        peer: string,
        amount: bigint,
        data: string,
        condition: string,
        lifetimeSeconds: number,
    ): Fulfill {
        const fulfilmentPacket = Interledger.prepare(ilpSecret, peer, amount, data, lifetimeSeconds);
        const fulfilmentCondition = fulfilmentPacket.base64Condition;
        const fulfilment = fulfilmentPacket.base64Fulfillment;

        const valid = fulfilmentCondition === condition;

        return {
            valid: valid,
            base64Fulfillment: fulfilment
        }
    }

    static unwrap(base64Packet: string): IlpPacket.IlpPrepare {
        const buffer = Interledger.base64Decode(base64Packet);
        return IlpPacket.deserializeIlpPrepare(buffer);
    }

    private static preimage(
        ilpSecret: string,
        amount: bigint,
        destination: string,
        data: string,
    ): Buffer {
        const joined = `${ilpSecret}:${amount.toString()}:${destination}:${data}`;
        return crypto.createHash('sha256').update(Buffer.from(joined, 'utf-8')).digest();
    }
}

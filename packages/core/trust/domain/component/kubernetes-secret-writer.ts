// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as fs from 'node:fs/promises';
import * as https from 'node:https';
import axios, {AxiosInstance} from 'axios';
import {Logger} from '@nestjs/common';

/**
 * Writes a single Kubernetes Secret, using the pod's own ServiceAccount.
 *
 * Talks to the API server over plain HTTP rather than through a client library, for
 * the same reason the Vault client does: the surface used here is two calls, and a
 * dependency that models the whole Kubernetes API earns nothing at that size.
 *
 * The credential is the pod's identity — nothing to distribute and nothing to
 * rotate. The RBAC it needs is deliberately narrow: get, create and patch on one
 * named Secret in one namespace.
 *
 * A target namespace may be given per call. It defaults to the pod's own, which is all the Hub CA
 * bundle needs — but an Istio gateway reads its credentials only from the namespace it runs in, so
 * delivering a CA there means writing across a boundary. That is a deliberate scope in Istio:
 * whoever can write that Secret decides which authority the gateway trusts, so it is granted by a
 * separate Role in that namespace rather than inherited.
 */
export class KubernetesSecretWriter {

    private static readonly SERVICE_ACCOUNT_DIR = '/var/run/secrets/kubernetes.io/serviceaccount';
    private static readonly MERGE_PATCH = 'application/merge-patch+json';

    private readonly logger = new Logger(KubernetesSecretWriter.name);

    private client: AxiosInstance | undefined;
    private namespace: string | undefined;

    constructor(
        private readonly apiServer: string = 'https://kubernetes.default.svc',
        private readonly serviceAccountDir: string = KubernetesSecretWriter.SERVICE_ACCOUNT_DIR,
    ) {}

    /**
     * Creates the Secret, or patches it if it already exists.
     *
     * Returns false when the write was skipped because the stored value already
     * matched. Rewriting an unchanged Secret is not free: it bumps the resource
     * version, and anything watching it reloads for nothing.
     */
    async putIfChanged(
        name: string,
        data: Record<string, string>,
        targetNamespace?: string,
    ): Promise<boolean> {
        const client = await this.connect();
        const namespace = await this.resolveNamespace(targetNamespace);
        const encoded = Object.fromEntries(
            Object.entries(data).map(([key, value]) => [key, Buffer.from(value).toString('base64')]),
        );

        const path = `/api/v1/namespaces/${namespace}/secrets/${name}`;
        const existing = await client.get(path);

        if (existing.status === 200) {
            const current = (existing.data?.data ?? {}) as Record<string, string>;
            const unchanged = Object.entries(encoded).every(([key, value]) => current[key] === value);

            if (unchanged) {
                return false;
            }

            await client.patch(path, {data: encoded}, {headers: {'Content-Type': KubernetesSecretWriter.MERGE_PATCH}});
            this.logger.log(`Updated Secret ${namespace}/${name}.`);

            return true;
        }

        await client.post(`/api/v1/namespaces/${namespace}/secrets`, {
            apiVersion: 'v1',
            kind: 'Secret',
            metadata: {name},
            type: 'Opaque',
            data: encoded,
        });
        this.logger.log(`Created Secret ${namespace}/${name}.`);

        return true;
    }

    /** One value out of a Secret, or null when the Secret or the key is absent. */
    async read(name: string, key: string, targetNamespace?: string): Promise<string | null> {
        const client = await this.connect();
        const namespace = await this.resolveNamespace(targetNamespace);

        const response = await client.get(`/api/v1/namespaces/${namespace}/secrets/${name}`);

        if (response.status === 404) {
            return null;
        }

        const encoded = (response.data?.data ?? {})[key] as string | undefined;

        return encoded == null ? null : Buffer.from(encoded, 'base64').toString('utf8');
    }

    private async resolveNamespace(override?: string): Promise<string> {

        if (override != null && override.trim().length > 0) {
            return override.trim();
        }

        return this.readNamespace();
    }

    private async connect(): Promise<AxiosInstance> {
        if (this.client != null) {
            return this.client;
        }

        const token = await this.readServiceAccountFile('token');
        const certificateAuthority = await this.readServiceAccountFile('ca.crt');

        this.client = axios.create({
            baseURL: this.apiServer,
            timeout: 10_000,
            headers: {Authorization: `Bearer ${token}`},
            httpsAgent: new https.Agent({ca: certificateAuthority}),
            // A 404 is a normal answer — "no such Secret yet" — not a failure.
            validateStatus: (status) => (status >= 200 && status < 300) || status === 404,
        });

        return this.client;
    }

    private async readNamespace(): Promise<string> {
        this.namespace ??= (await this.readServiceAccountFile('namespace')).trim();
        return this.namespace;
    }

    private async readServiceAccountFile(file: string): Promise<string> {
        return fs.readFile(`${this.serviceAccountDir}/${file}`, 'utf8');
    }
}

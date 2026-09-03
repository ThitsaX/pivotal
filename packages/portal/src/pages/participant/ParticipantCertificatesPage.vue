<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2024-2026 ThitsaWorks Pte. Ltd. -->

<script setup lang="ts">
import {computed, reactive, ref} from 'vue';
import AdminTable from '../../components/admin/AdminTable.vue';
import ConfirmDialog from '../../components/admin/ConfirmDialog.vue';
import {
    type DfspCertificateSummary,
    enrollDfspCertificate,
    getDfspCertificate,
    listDfspCertificates,
    revokeDfspCertificate,
    toDownloadableBundle,
} from '../../modules/participant/certificates-api';

const COLUMNS = [
    {key: 'status', label: 'Status', width: '110px'},
    {key: 'serial', label: 'Serial'},
    {key: 'fingerprint', label: 'Fingerprint (SHA-256)'},
    {key: 'validity', label: 'Valid Until'},
    {key: 'issuedAt', label: 'Issued'},
    {key: 'note', label: 'Note'},
];

/**
 * Colour carries the same meaning as the status word, so the row that needs attention is findable
 * without reading every cell.
 */
const STATUS_TONE: Record<string, string> = {
    active:   'bg-emerald-50 text-emerald-700 ring-emerald-200',
    retiring: 'bg-amber-50 text-amber-700 ring-amber-200',
    revoked:  'bg-rose-50 text-rose-700 ring-rose-200',
    expired:  'bg-slate-100 text-slate-600 ring-slate-200',
};

const form = reactive({
    fspId: '',
    csrPem: '',
    note: '',
});

const state = reactive({
    loadedFspId: '',
    rows: [] as DfspCertificateSummary[],
    loading: false,
    loadError: null as string | null,
    enrolling: false,
    message: null as string | null,
    error: null as string | null,
});

const revocation = reactive({
    open: false,
    busy: false,
    target: null as DfspCertificateSummary | null,
    reason: '',
    error: null as string | null,
});

const canEnroll = computed((): boolean => {
    return form.fspId.trim().length > 0
        && form.csrPem.trim().length > 0
        && !state.enrolling;
});

const formatDate = (value: string | null): string => {
    if (value == null) {
        return '—';
    }

    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10);
};

/** Days remaining, so an operator sees "expiring" before it becomes "expired". */
const daysUntil = (value: string): number => {
    return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
};

const statusTone = (status: string): string => {
    return STATUS_TONE[status] ?? 'bg-slate-100 text-slate-600 ring-slate-200';
};

const shortFingerprint = (fingerprint: string): string => {
    return `${fingerprint.slice(0, 16)}…${fingerprint.slice(-8)}`;
};

const load = async (fspId: string): Promise<void> => {

    const target = fspId.trim();

    if (target.length === 0) {
        return;
    }

    state.loading = true;
    state.loadError = null;

    try {
        const result = await listDfspCertificates(target);

        state.rows = result.certificates ?? [];
        state.loadedFspId = target;
    } catch (error) {
        state.rows = [];
        state.loadError = error instanceof Error ? error.message : String(error);
    } finally {
        state.loading = false;
    }
};

const enroll = async (): Promise<void> => {

    if (!canEnroll.value) {
        return;
    }

    state.enrolling = true;
    state.error = null;
    state.message = null;

    try {
        const issued = await enrollDfspCertificate(
            form.fspId.trim(), form.csrPem.trim(), form.note.trim());

        state.message = `Issued for ${issued.fspId}, serial ${issued.serial}, valid until `
            + `${formatDate(issued.validTo)}. Download the certificate and chain to return to the DFSP.`;

        form.csrPem = '';
        form.note = '';

        await load(issued.fspId);
    } catch (error) {
        state.error = error instanceof Error ? error.message : String(error);
    } finally {
        state.enrolling = false;
    }
};

/**
 * Fetches the material on demand rather than holding it in the list.
 *
 * The certificate is public, but several kilobytes per row is noise in a table, and the operator
 * only needs it at the moment they are handing it back.
 */
const download = async (row: DfspCertificateSummary): Promise<void> => {

    state.error = null;

    try {
        const material = await getDfspCertificate(row.id);
        const blob = new Blob([toDownloadableBundle(material)], {type: 'application/x-pem-file'});
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');

        anchor.href = url;
        anchor.download = `${row.fspId}-${row.serial.replace(/[^A-Za-z0-9]/g, '')}.pem`;
        anchor.click();

        URL.revokeObjectURL(url);
    } catch (error) {
        state.error = error instanceof Error ? error.message : String(error);
    }
};

const askToRevoke = (row: DfspCertificateSummary): void => {
    revocation.target = row;
    revocation.reason = '';
    revocation.error = null;
    revocation.open = true;
};

const confirmRevoke = async (): Promise<void> => {

    if (revocation.target == null) {
        return;
    }

    revocation.busy = true;
    revocation.error = null;

    try {
        await revokeDfspCertificate(revocation.target.id, revocation.reason.trim());

        state.message = `Revoked serial ${revocation.target.serial}. The DFSP cannot connect with it again.`;
        revocation.open = false;
        revocation.target = null;

        await load(state.loadedFspId);
    } catch (error) {
        revocation.error = error instanceof Error ? error.message : String(error);
    } finally {
        revocation.busy = false;
    }
};

const isRevocable = (row: DfspCertificateSummary): boolean => {
    // A superseded certificate is still presentable until it expires, so it stays revocable.
    return row.status === 'active' || row.status === 'retiring';
};
</script>

<template>
    <div class="space-y-5">
        <header>
            <p class="font-display text-xs uppercase tracking-[0.22em] text-accent">Participant</p>
            <h1 class="mt-1 text-2xl font-semibold text-ink">Certificates</h1>
            <p class="mt-1 max-w-3xl text-sm text-slate-500">
                Sign a DFSP's certificate request and return the signed certificate with its chain.
                The DFSP generates its own key and never sends it here — only the request.
            </p>
        </header>

        <section class="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-soft">
            <h2 class="font-display text-sm font-semibold uppercase tracking-[0.08em] text-accent">
                Enroll a certificate
            </h2>

            <form class="mt-4 space-y-4" @submit.prevent="enroll">
                <div class="grid gap-4 md:grid-cols-2">
                    <label class="block">
                        <span class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                            Participant
                        </span>
                        <input
                            v-model="form.fspId"
                            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                            type="text"
                            placeholder="wallet1"
                            autocomplete="off"
                        >
                        <span class="mt-1 block text-xs text-slate-500">
                            The certificate's common name is set to this, whatever the request asks for.
                        </span>
                    </label>

                    <label class="block">
                        <span class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                            Note <span class="font-normal normal-case text-slate-400">(optional)</span>
                        </span>
                        <input
                            v-model="form.note"
                            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                            type="text"
                            placeholder="Ticket reference, who requested it"
                            maxlength="512"
                        >
                        <span class="mt-1 block text-xs text-slate-500">
                            Kept with the certificate; enrollment happens off-system, so this is the trail.
                        </span>
                    </label>
                </div>

                <label class="block">
                    <span class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                        Certificate Signing Request
                    </span>
                    <textarea
                        v-model="form.csrPem"
                        rows="8"
                        class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                        placeholder="-----BEGIN CERTIFICATE REQUEST-----"
                        spellcheck="false"
                    />
                </label>

                <div class="flex flex-wrap items-center gap-3">
                    <button
                        type="submit"
                        class="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                        :disabled="!canEnroll"
                    >
                        {{ state.enrolling ? 'Signing…' : 'Sign request' }}
                    </button>

                    <button
                        type="button"
                        class="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
                        :disabled="state.loading"
                        @click="load(form.fspId)"
                    >
                        Show certificates
                    </button>
                </div>
            </form>

            <p v-if="state.message != null" class="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {{ state.message }}
            </p>

            <p v-if="state.error != null" class="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {{ state.error }}
            </p>
        </section>

        <section v-if="state.loadedFspId.length > 0" class="space-y-3">
            <h2 class="font-display text-sm font-semibold uppercase tracking-[0.08em] text-accent">
                Certificates for {{ state.loadedFspId }}
            </h2>

            <AdminTable
                :columns="COLUMNS"
                :rows="state.rows"
                :loading="state.loading"
                :error="state.loadError"
                empty-text="This participant holds no certificates."
            >
                <template #cell="{row, column}">
                    <template v-if="column.key === 'status'">
                        <span
                            class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ring-1"
                            :class="statusTone(row.status)"
                        >
                            {{ row.status }}
                        </span>
                    </template>

                    <template v-else-if="column.key === 'serial'">
                        <span class="font-mono text-xs text-ink">{{ row.serial }}</span>
                    </template>

                    <template v-else-if="column.key === 'fingerprint'">
                        <span class="font-mono text-xs text-slate-600" :title="row.fingerprintSha256">
                            {{ shortFingerprint(row.fingerprintSha256) }}
                        </span>
                    </template>

                    <template v-else-if="column.key === 'validity'">
                        <span class="text-sm text-ink">{{ formatDate(row.validTo) }}</span>
                        <span
                            v-if="row.status === 'active' && daysUntil(row.validTo) <= 30"
                            class="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-700"
                        >
                            {{ daysUntil(row.validTo) > 0 ? `${daysUntil(row.validTo)}d left` : 'lapsed' }}
                        </span>
                    </template>

                    <template v-else-if="column.key === 'issuedAt'">
                        <span class="text-sm text-slate-500">{{ formatDate(row.issuedAt) }}</span>
                    </template>

                    <template v-else-if="column.key === 'note'">
                        <span class="text-xs text-slate-500">{{ row.note ?? '—' }}</span>
                    </template>
                </template>

                <template #actions="{row}">
                    <div class="flex justify-end gap-2">
                        <button
                            type="button"
                            class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-slate-50"
                            @click="download(row)"
                        >
                            Download
                        </button>

                        <button
                            v-if="isRevocable(row)"
                            type="button"
                            class="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                            @click="askToRevoke(row)"
                        >
                            Revoke
                        </button>
                    </div>
                </template>
            </AdminTable>
        </section>

        <ConfirmDialog
            :open="revocation.open"
            tone="danger"
            title="Revoke this certificate?"
            :message="revocation.target == null
                ? ''
                : `Serial ${revocation.target.serial} for ${revocation.target.fspId} will stop being accepted immediately, and cannot be reinstated. The DFSP must enroll again.`"
            :confirm-token="revocation.target?.serial"
            confirm-label="Revoke"
            :busy="revocation.busy"
            :error-message="revocation.error"
            @confirm="confirmRevoke"
            @cancel="revocation.open = false"
        />
    </div>
</template>

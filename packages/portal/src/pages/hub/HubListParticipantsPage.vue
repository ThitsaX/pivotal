<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import TimeZoneSelector from '../../components/TimeZoneSelector.vue';
import {VIEW_BY_KEY} from '../../modules/audit/view-definitions';
import {fetchParticipantResource, type ParticipantSummary} from '../../modules/participant/api';

const props = defineProps<{
    selectedTimeZone: string;
}>();

const emit = defineEmits<{
    (event: 'update:selectedTimeZone', value: string): void;
}>();

const viewDefinition = VIEW_BY_KEY['hub-list-participants'];
const HUB_PARTICIPANT_NAME = 'Hub';

const loading = ref(false);
const errorMessage = ref<string | null>(null);
const participants = ref<ParticipantSummary[]>([]);
const selectedCurrencyByParticipant = ref<Record<string, string>>({});

const totalParticipants = computed((): number => {
    return participants.value.length;
});

const totalActiveParticipants = computed((): number => {
    return participants.value.filter((participant: ParticipantSummary): boolean => isActiveValue(participant.isActive)).length;
});

const totalProxyParticipants = computed((): number => {
    return participants.value.filter((participant: ParticipantSummary): boolean => participant.isProxy === true).length;
});

const sortedParticipants = computed((): ParticipantSummary[] => {
    return participants.value
        .slice()
        .sort((left: ParticipantSummary, right: ParticipantSummary): number => {
            const leftIsHub = isHubParticipant(left);
            const rightIsHub = isHubParticipant(right);

            if (leftIsHub !== rightIsHub) {
                return leftIsHub ? -1 : 1;
            }

            return left.name.localeCompare(right.name);
        });
});

const loadParticipants = async (): Promise<void> => {
    loading.value = true;
    errorMessage.value = null;

    try {
        participants.value = await fetchParticipantResource<ParticipantSummary[]>(viewDefinition.endpoint);
        selectedCurrencyByParticipant.value = participants.value.reduce(
            (selectedCurrencies: Record<string, string>, participant: ParticipantSummary): Record<string, string> => {
                const currencies = resolveCurrencies(participant);
                const selectedCurrency = selectedCurrencyByParticipant.value[participant.name];

                if (selectedCurrency != null && currencies.includes(selectedCurrency)) {
                    selectedCurrencies[participant.name] = selectedCurrency;

                    return selectedCurrencies;
                }

                if (currencies.length > 0) {
                    selectedCurrencies[participant.name] = currencies[0];
                }

                return selectedCurrencies;
            },
            {},
        );
    } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
        participants.value = [];
        selectedCurrencyByParticipant.value = {};
    } finally {
        loading.value = false;
    }
};

const isActiveValue = (value: unknown): boolean => {
    if (value === true || value === 1 || value === '1') {
        return true;
    }

    if (typeof value === 'string') {
        return value.trim().toLowerCase() === 'true';
    }

    return false;
};

const isHubParticipant = (participant: ParticipantSummary): boolean => {
    return participant.name.trim().toLowerCase() === HUB_PARTICIPANT_NAME.toLowerCase();
};

const resolveCurrencies = (participant: ParticipantSummary): string[] => {
    return Array.from(
        new Set(
            (participant.accounts ?? [])
                .map((account): string => account.currency?.trim() ?? '')
                .filter((currency: string): boolean => currency.length > 0),
        ),
    ).sort((left: string, right: string): number => left.localeCompare(right));
};

const toggleCurrencySelection = (participantName: string, currency: string): void => {
    selectedCurrencyByParticipant.value = {
        ...selectedCurrencyByParticipant.value,
        [participantName]: currency,
    };
};

const resolveSelectedCurrency = (participant: ParticipantSummary): string => {
    return selectedCurrencyByParticipant.value[participant.name]?.trim() ?? '';
};

const resolveVisibleAccounts = (
    participant: ParticipantSummary,
): NonNullable<ParticipantSummary['accounts']> => {
    const selectedCurrency = resolveSelectedCurrency(participant);

    if (selectedCurrency.length === 0) {
        return [];
    }

    return (participant.accounts ?? []).filter((account): boolean => {
        return (account.currency?.trim() ?? '') === selectedCurrency;
    });
};

onMounted((): void => {
    void loadParticipants();
});
</script>

<template>
    <section class="animate-fadeSlide pt-2">
        <div class="mb-2 flex justify-end">
            <div class="w-full max-w-[13rem]">
                <TimeZoneSelector
                    :model-value="props.selectedTimeZone"
                    compact
                    @update:model-value="emit('update:selectedTimeZone', $event)"
                />
            </div>
        </div>

        <article class="overflow-visible border border-accent/20 bg-[#fafdff] shadow-[0_18px_40px_rgba(20,127,195,0.08)]">
            <div class="border-b border-accent/15 bg-[linear-gradient(135deg,rgba(20,127,195,0.14),rgba(255,255,255,0.95))] px-5 py-5">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                            Hub
                        </p>
                        <h3 class="mt-2 font-display text-2xl text-ink">
                            {{ viewDefinition.title }}
                        </h3>
                        <p class="mt-2 max-w-3xl text-sm text-slate-600">
                            {{ viewDefinition.subtitle }}
                        </p>
                    </div>

                    <button
                        type="button"
                        class="inline-flex items-center justify-center rounded-lg border border-accent/25 bg-white px-3.5 py-2 text-xs font-semibold text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                        :disabled="loading"
                        @click="loadParticipants"
                    >
                        {{ loading ? 'Refreshing...' : 'Refresh List' }}
                    </button>
                </div>
            </div>

            <div class="grid gap-4 px-5 py-5 lg:grid-cols-3">
                <article class="rounded-xl border border-accent/20 bg-white px-4 py-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                        Total
                    </p>
                    <p class="mt-2 font-display text-3xl text-ink">
                        {{ totalParticipants }}
                    </p>
                </article>

                <article class="rounded-xl border border-accent/20 bg-white px-4 py-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                        Active
                    </p>
                    <p class="mt-2 font-display text-3xl text-ink">
                        {{ totalActiveParticipants }}
                    </p>
                </article>

                <article class="rounded-xl border border-accent/20 bg-white px-4 py-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                        Proxy
                    </p>
                    <p class="mt-2 font-display text-3xl text-ink">
                        {{ totalProxyParticipants }}
                    </p>
                </article>
            </div>

            <div class="px-5 pb-5">
                <article class="overflow-hidden border border-accent/20 bg-white shadow-[0_18px_40px_rgba(20,127,195,0.08)]">
                    <div class="flex items-center justify-between border-b border-accent/15 bg-[#f8fbff] px-4 py-3">
                        <div>
                            <p class="font-display text-sm font-semibold uppercase tracking-[0.08em] text-accent">
                                Participant Directory
                            </p>
                            <p class="mt-0.5 text-xs text-slate-500">
                                Review each participant together with its supported currencies and ledger accounts.
                            </p>
                        </div>

                        <p class="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                            {{ loading ? 'Loading' : `${participants.length} records` }}
                        </p>
                    </div>

                    <div
                        v-if="errorMessage != null"
                        class="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
                    >
                        {{ errorMessage }}
                    </div>

                    <div
                        v-else-if="!loading && participants.length === 0"
                        class="px-4 py-6 text-sm text-slate-500"
                    >
                        No participants were returned.
                    </div>

                    <div v-else class="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
                        <article
                            v-for="participant in sortedParticipants"
                            :key="participant.name"
                            :class="[
                                'overflow-hidden rounded-2xl border shadow-[0_16px_38px_rgba(15,23,42,0.08)] transition',
                                isHubParticipant(participant)
                                    ? 'border-amber-300 bg-[linear-gradient(180deg,rgba(255,251,235,0.96),rgba(255,255,255,0.98))]'
                                    : 'border-accent/15 bg-[linear-gradient(180deg,rgba(248,251,255,0.9),rgba(255,255,255,0.98))]',
                            ]"
                        >
                            <div
                                :class="[
                                    'border-b px-4 py-4',
                                    isHubParticipant(participant)
                                        ? 'border-amber-200 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(255,255,255,0.92))]'
                                        : 'border-accent/15 bg-[linear-gradient(135deg,rgba(20,127,195,0.12),rgba(255,255,255,0.92))]',
                                ]"
                            >
                                <div class="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div class="flex flex-wrap items-center gap-2">
                                            <h4 class="font-display text-xl text-ink">
                                                {{ participant.name }}
                                            </h4>

                                            <span
                                                v-if="isHubParticipant(participant)"
                                                class="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800"
                                            >
                                                Hub
                                            </span>
                                        </div>
                                    </div>

                                    <div class="flex flex-wrap justify-end gap-2">
                                        <span
                                            :class="[
                                                'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]',
                                                isActiveValue(participant.isActive)
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-slate-200 text-slate-600',
                                            ]"
                                        >
                                            {{ isActiveValue(participant.isActive) ? 'Active' : 'Inactive' }}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div class="space-y-5 px-4 py-4">
                                <section>
                                    <div class="flex items-center justify-between gap-3">
                                        <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                            Supported Currencies
                                        </p>

                                        <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                                            {{ resolveCurrencies(participant).length }}
                                        </span>
                                    </div>

                                    <div v-if="resolveCurrencies(participant).length > 0" class="mt-3 flex flex-wrap gap-2">
                                        <button
                                            v-for="currency in resolveCurrencies(participant)"
                                            :key="`${participant.name}-${currency}`"
                                            type="button"
                                            :class="[
                                                'rounded-full border px-2.5 py-1 text-xs font-semibold transition',
                                                resolveSelectedCurrency(participant) === currency
                                                    ? isHubParticipant(participant)
                                                        ? 'border-amber-400 bg-amber-200 text-amber-900'
                                                        : 'border-accent bg-accent text-white'
                                                    : isHubParticipant(participant)
                                                        ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                                        : 'border-accent/20 bg-accentSoft/60 text-accent hover:bg-accentSoft',
                                            ]"
                                            @click="toggleCurrencySelection(participant.name, currency)"
                                        >
                                            {{ currency }}
                                        </button>
                                    </div>

                                    <p v-else class="mt-3 text-sm text-slate-500">
                                        No currencies available.
                                    </p>
                                </section>

                                <section>
                                    <div class="flex items-center justify-between gap-3">
                                        <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                            Accounts
                                        </p>

                                        <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                                            {{
                                                resolveSelectedCurrency(participant).length > 0
                                                    ? `${resolveVisibleAccounts(participant).length} shown`
                                                    : `${participant.accounts?.length ?? 0} total`
                                            }}
                                        </span>
                                    </div>

                                    <p
                                        v-if="(participant.accounts?.length ?? 0) > 0 && resolveSelectedCurrency(participant).length === 0"
                                        class="mt-3 text-sm text-slate-500"
                                    >
                                        Click a currency above to display account information.
                                    </p>

                                    <div
                                        v-else-if="resolveVisibleAccounts(participant).length > 0"
                                        class="mt-3 space-y-3"
                                    >
                                        <article
                                            v-for="account in resolveVisibleAccounts(participant)"
                                            :key="`${participant.name}-${account.id}`"
                                            :class="[
                                                'rounded-xl border px-3 py-3',
                                                isHubParticipant(participant)
                                                    ? 'border-amber-200 bg-white/80'
                                                    : 'border-slate-200 bg-white/90',
                                            ]"
                                        >
                                            <div class="flex flex-wrap items-start justify-between gap-2">
                                                <div>
                                                    <p class="text-sm font-semibold text-ink">
                                                        {{ account.ledgerAccountType }}
                                                    </p>
                                                    <p class="mt-1 text-xs text-slate-500">
                                                        Account ID: {{ account.id }}
                                                    </p>
                                                </div>

                                                <div class="flex flex-wrap justify-end gap-2">
                                                    <span
                                                        v-if="account.currency != null && account.currency.trim().length > 0"
                                                        class="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600"
                                                    >
                                                        {{ account.currency }}
                                                    </span>

                                                    <span
                                                        :class="[
                                                            'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]',
                                                            isActiveValue(account.isActive)
                                                                ? 'bg-emerald-100 text-emerald-700'
                                                                : 'bg-slate-200 text-slate-600',
                                                        ]"
                                                    >
                                                        {{ isActiveValue(account.isActive) ? 'Active' : 'Inactive' }}
                                                    </span>
                                                </div>
                                            </div>
                                        </article>
                                    </div>

                                    <p
                                        v-else-if="(participant.accounts?.length ?? 0) > 0"
                                        class="mt-3 text-sm text-slate-500"
                                    >
                                        No accounts found for {{ resolveSelectedCurrency(participant) }}.
                                    </p>

                                    <p v-else class="mt-3 text-sm text-slate-500">
                                        No accounts available.
                                    </p>
                                </section>
                            </div>
                        </article>
                    </div>
                </article>
            </div>
        </article>
    </section>
</template>

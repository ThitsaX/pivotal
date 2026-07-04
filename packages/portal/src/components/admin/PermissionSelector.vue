<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 ThitsaWorks -->

<script setup lang="ts">
import {computed} from 'vue';
import {type AdminPermission, namespaceLabel, namespaceOf} from '../../stores/permissions-admin.store';

const props = defineProps<{
    /** The full permission catalogue to render. */
    availablePermissions: readonly AdminPermission[];
    /** Currently selected permission keys. v-model:modelValue. */
    modelValue:           readonly string[];
    /** When true, admin.* keys that are currently selected cannot be unchecked. */
    lockAdminKeys?:       boolean;
    /** When true, every checkbox is disabled (used while saving). */
    disabled?:            boolean;
    /** When set, only perms whose scope matches (or is BOTH) are rendered. */
    scopeFilter?:         'HUB' | 'DFSP';
}>();

const emit = defineEmits<{
    'update:modelValue': [value: string[]];
}>();

const selectedSet = computed((): Set<string> => new Set(props.modelValue));

const groups = computed((): Array<{namespace: string; label: string; items: AdminPermission[]}> => {
    const byNs = new Map<string, AdminPermission[]>();
    for (const perm of props.availablePermissions) {
        if (props.scopeFilter != null && perm.scope !== 'BOTH' && perm.scope !== props.scopeFilter) {
            continue;
        }
        const ns = namespaceOf(perm.keyName);
        const bucket = byNs.get(ns);
        if (bucket == null) {
            byNs.set(ns, [perm]);
        } else {
            bucket.push(perm);
        }
    }
    const out: Array<{namespace: string; label: string; items: AdminPermission[]}> = [];
    for (const [ns, items] of byNs.entries()) {
        out.push({
            namespace: ns,
            label:     namespaceLabel(ns),
            items:     items.slice().sort((a, b) => a.keyName.localeCompare(b.keyName)),
        });
    }
    out.sort((a, b) => a.namespace.localeCompare(b.namespace));
    return out;
});

const isAdminKey = (key: string): boolean => key.startsWith('admin.');

const isLocked = (key: string): boolean => {
    if (props.lockAdminKeys !== true) return false;
    if (!isAdminKey(key)) return false;
    return selectedSet.value.has(key);
};

const toggle = (key: string, checked: boolean): void => {
    if (props.disabled === true) return;
    if (!checked && isLocked(key)) return;
    const next = new Set(selectedSet.value);
    if (checked) {
        next.add(key);
    } else {
        next.delete(key);
    }
    emit('update:modelValue', Array.from(next).sort());
};

const onCheckboxChange = (key: string, event: Event): void => {
    const target = event.target as HTMLInputElement;
    toggle(key, target.checked);
};

const groupCounts = (items: AdminPermission[]): {selected: number; total: number} => {
    let selected = 0;
    for (const item of items) {
        if (selectedSet.value.has(item.keyName)) selected += 1;
    }
    return {selected, total: items.length};
};
</script>

<template>
    <div class="space-y-4">
        <div v-for="group in groups" :key="group.namespace" class="rounded-lg border border-slate-200 bg-white">
            <header class="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <h3 class="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                    {{ group.label }}
                </h3>
                <span class="text-xs text-slate-500">
                    {{ groupCounts(group.items).selected }} / {{ groupCounts(group.items).total }}
                </span>
            </header>
            <ul class="divide-y divide-slate-100">
                <li
                    v-for="perm in group.items"
                    :key="perm.id"
                    class="flex items-start gap-3 px-3 py-2"
                >
                    <input
                        :id="`perm-${perm.id}`"
                        type="checkbox"
                        class="mt-1 h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent disabled:cursor-not-allowed"
                        :checked="selectedSet.has(perm.keyName)"
                        :disabled="disabled === true || isLocked(perm.keyName)"
                        :title="isLocked(perm.keyName) ? 'System roles must retain their admin.* permissions.' : undefined"
                        @change="(event) => onCheckboxChange(perm.keyName, event)"
                    >
                    <label :for="`perm-${perm.id}`" class="flex-1 cursor-pointer select-none">
                        <span class="block font-mono text-xs text-ink">{{ perm.keyName }}</span>
                        <span v-if="perm.description != null" class="block text-xs text-slate-500">
                            {{ perm.description }}
                        </span>
                    </label>
                </li>
            </ul>
        </div>
    </div>
</template>

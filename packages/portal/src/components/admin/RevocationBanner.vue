<script setup lang="ts">
defineProps<{
    message?: string;
}>();
</script>

<template>
    <div
        class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        role="status"
    >
        {{ message ?? "Permission changes take effect on the user's next sign-in or refresh, typically within seconds." }}
    </div>
</template>

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    plugins: [vue()],
    server: {
        host: true,
        port: 4173,
    },
});

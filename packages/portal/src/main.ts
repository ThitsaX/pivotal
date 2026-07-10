// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {createApp} from 'vue';
import VueApexCharts from 'vue3-apexcharts';
import App from './App.vue';
import {router} from './router';
import {authStore} from './stores/auth.store';
import './assets/tailwind.css';

void authStore.bootstrap().finally((): void => {
    createApp(App)
        .use(router)
        .use(VueApexCharts)
        .mount('#app');
});

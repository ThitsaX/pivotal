import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { authStore } from './stores/auth.store';
import './assets/tailwind.css';
void authStore.bootstrap().finally(() => {
    createApp(App).use(router).mount('#app');
});

import {
    createRouter,
    createWebHistory,
    type RouteLocationNormalized,
    type RouteLocationRaw,
} from 'vue-router';
import AppShell from '../pages/AppShell.vue';
import ChangePasswordPage from '../pages/auth/ChangePasswordPage.vue';
import LoginPage from '../pages/auth/LoginPage.vue';
import {authStore} from '../stores/auth.store';

declare module 'vue-router' {
    interface RouteMeta {
        public?: boolean;
    }
}

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/login',
            name: 'login',
            component: LoginPage,
            meta: {public: true},
        },
        {
            path: '/change-password',
            name: 'change-password',
            component: ChangePasswordPage,
        },
        {
            path: '/:pathMatch(.*)*',
            name: 'app',
            component: AppShell,
        },
    ],
});

const buildLoginRedirect = (to: RouteLocationNormalized): RouteLocationRaw => {

    if (to.path === '/login') {
        return '/login';
    }

    return {path: '/login', query: {next: to.fullPath}};
};

router.beforeEach((to): boolean | RouteLocationRaw => {

    if (authStore.isBootstrapping.value) {
        return true;
    }

    if (to.meta.public === true) {
        return true;
    }

    if (!authStore.isAuthenticated.value) {
        return buildLoginRedirect(to);
    }

    if (authStore.needsPasswordChange.value && to.name !== 'change-password') {
        return {path: '/change-password', query: {next: to.fullPath}};
    }

    return true;
});

authStore.onSessionExpired((): void => {
    const current = router.currentRoute.value;

    void router.replace(buildLoginRedirect(current));
});

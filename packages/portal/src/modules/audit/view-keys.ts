import type {ViewKey} from './types';

/**
 * Every menu key the frontend has a registered component for (the keys of
 * AppShell's pageComponentByKey, in array form). MenusPage uses this to warn
 * when an admin creates a menu whose key has no frontend page yet.
 *
 * Kept in its own value module so esbuild does not tree-shake it away when
 * consumers `import type` from `./types`.
 */
export const KNOWN_VIEW_KEYS: readonly ViewKey[] = [
    'hub-add-currency',
    'hub-list-participants',
    'hub-add-signing-keys',
    'participant-onboarding',
    'participant-add-signing-keys',
    'participant-add-new-currency',
    'participant-register-endpoint',
    'transactions',
    'admin-users',
    'admin-roles',
    'admin-permissions',
    'admin-menus',
];

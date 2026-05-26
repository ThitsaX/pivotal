export const ROLE_SCOPES = ['HUB', 'DFSP'] as const;

export type RoleScope = typeof ROLE_SCOPES[number];

export const PERMISSION_SCOPES = ['HUB', 'DFSP', 'BOTH'] as const;

export type PermissionScope = typeof PERMISSION_SCOPES[number];

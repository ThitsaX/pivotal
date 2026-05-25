export class AdminErrorCode {

    static readonly USER_EMAIL_TAKEN            = 'ADMIN_USER_EMAIL_TAKEN';

    static readonly USER_DFSP_REQUIRES_FSP_ID   = 'ADMIN_USER_DFSP_REQUIRES_FSP_ID';

    static readonly USER_ADMIN_FORBIDS_FSP_ID   = 'ADMIN_USER_ADMIN_FORBIDS_FSP_ID';

    static readonly USER_SELF_LOCK              = 'ADMIN_USER_SELF_LOCK';

    static readonly USER_LAST_ADMIN             = 'ADMIN_USER_LAST_ADMIN';

    static readonly USER_NOT_FOUND              = 'ADMIN_USER_NOT_FOUND';

    static readonly USER_ROLE_NOT_FOUND         = 'ADMIN_USER_ROLE_NOT_FOUND';

    static readonly ROLE_NOT_FOUND              = 'ADMIN_ROLE_NOT_FOUND';

    static readonly ROLE_CODE_TAKEN             = 'ADMIN_ROLE_CODE_TAKEN';

    static readonly ROLE_IMMUTABLE_FIELD        = 'ADMIN_ROLE_IMMUTABLE_FIELD';

    static readonly ROLE_IS_SYSTEM              = 'ADMIN_ROLE_IS_SYSTEM';

    static readonly ROLE_IN_USE                 = 'ADMIN_ROLE_IN_USE';

    static readonly ROLE_CANNOT_REMOVE_ADMIN_KEY = 'ADMIN_ROLE_CANNOT_REMOVE_ADMIN_KEY';

    static readonly ROLE_PERMISSION_SCOPE_MISMATCH = 'ADMIN_ROLE_PERMISSION_SCOPE_MISMATCH';

    static readonly PERMISSION_NOT_FOUND        = 'ADMIN_PERMISSION_NOT_FOUND';

    static readonly MENU_NOT_FOUND              = 'ADMIN_MENU_NOT_FOUND';

    static readonly MENU_KEY_TAKEN              = 'ADMIN_MENU_KEY_TAKEN';

    static readonly MENU_IMMUTABLE_FIELD        = 'ADMIN_MENU_IMMUTABLE_FIELD';

    static readonly MENU_PARENT_NOT_FOUND       = 'ADMIN_MENU_PARENT_NOT_FOUND';
}

export const ADMIN_ERROR_MESSAGES: Record<string, string> = {
    [AdminErrorCode.USER_EMAIL_TAKEN]:               'A user with that email already exists.',
    [AdminErrorCode.USER_DFSP_REQUIRES_FSP_ID]:      'A DFSP-scoped role requires fspId.',
    [AdminErrorCode.USER_ADMIN_FORBIDS_FSP_ID]:      'A HUB-scoped role does not accept fspId.',
    [AdminErrorCode.USER_SELF_LOCK]:                 'You cannot change your own role or active status, or delete your own account.',
    [AdminErrorCode.USER_LAST_ADMIN]:                'This change would leave no active users able to manage other users.',
    [AdminErrorCode.USER_NOT_FOUND]:                 'User not found.',
    [AdminErrorCode.USER_ROLE_NOT_FOUND]:            'The specified role does not exist.',
    [AdminErrorCode.ROLE_NOT_FOUND]:                 'Role not found.',
    [AdminErrorCode.ROLE_CODE_TAKEN]:                'A role with that code already exists.',
    [AdminErrorCode.ROLE_IMMUTABLE_FIELD]:           'The code and isSystem fields cannot be changed after the role is created.',
    [AdminErrorCode.ROLE_IS_SYSTEM]:                 'System roles cannot be deleted.',
    [AdminErrorCode.ROLE_IN_USE]:                    'This role is assigned to one or more users and cannot be deleted.',
    [AdminErrorCode.ROLE_CANNOT_REMOVE_ADMIN_KEY]:   'System roles must retain their admin.* permissions.',
    [AdminErrorCode.ROLE_PERMISSION_SCOPE_MISMATCH]: 'One or more permissions cannot be assigned to a role with that scope.',
    [AdminErrorCode.PERMISSION_NOT_FOUND]:           'One or more of the requested permission keys does not exist.',
    [AdminErrorCode.MENU_NOT_FOUND]:                 'Menu not found.',
    [AdminErrorCode.MENU_KEY_TAKEN]:                 'A menu with that menuKey already exists.',
    [AdminErrorCode.MENU_IMMUTABLE_FIELD]:           'The menuKey field cannot be changed after the menu is created.',
    [AdminErrorCode.MENU_PARENT_NOT_FOUND]:          'The specified parent menu does not exist.',
};

export function adminError(code: string): { code: string; message: string } {

    const message = ADMIN_ERROR_MESSAGES[code];

    if (message == null) {
        throw new Error(`Unknown admin error code: ${code}`);
    }

    return {code, message};
}

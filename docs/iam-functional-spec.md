# Pivotal IAM — Functionality Document

This document describes *what the Identity & Access Management (IAM) system does* in plain business terms — the available functions, the rules behind them, and what happens when each function is used. No code knowledge required.

**Scope:** The IAM module of the Pivotal portal/admin service (`web-pivotal`). It governs *who can log in* and *what they are allowed to see and do*.

---

## 1. Concepts (read this first)

| Term | Meaning in plain language |
|---|---|
| **User** | A person with a login (email + password) to the Pivotal portal. |
| **Role** | A named bundle of permissions assigned to a user (e.g. "System Administrator", "DFSP Operator"). A user has exactly **one** role. |
| **Permission** | A single capability, e.g. "onboard a participant" or "view a transaction". Roles are made of permissions. |
| **Scope (HUB vs DFSP)** | Every role is either **HUB** (hub-wide staff) or **DFSP** (tied to one FSP/wallet). This controls *how much data* the user can see. |
| **FSP ID** | The single FSP a DFSP user is locked to. HUB users have none. |
| **Menu** | A sidebar item in the portal. Each menu is revealed only to users who hold its required permission. |
| **Permission preset** | A ready-made template of permissions an admin can pick when creating a role, so they don't start from scratch. |

**The two golden rules of the system**

1. **A role's scope decides data visibility.** HUB users see everything; a DFSP user only ever sees their own FSP's data — even if they hold the same permission as a HUB user.
2. **HUB and DFSP are mutually exclusive per account.** A HUB user must **not** be tied to an FSP; a DFSP user **must** be tied to one FSP. Someone who needs both gets two separate accounts.

---

## 2. The seeded baseline (what exists on a fresh install)

- **2 system roles** (cannot be deleted):
  - **ADMIN** (System Administrator, HUB scope) — holds **all** permissions.
  - **DFSP_USER** (DFSP Operator, DFSP scope) — holds **audit list + audit view** only.
- **1 bootstrap admin user** — created from configuration, flagged *must change password* on first login.
- **13 permissions** and **12 sidebar menus**, pre-linked.
- **6 role presets** (templates) for building new roles: Full Admin, Hub Onboarder, Hub Settlement & Currency, Hub Compliance/Audit, DFSP Operator, User & Role Manager.

---

## 3. The 13 permissions (capability catalogue)

| Permission key | What it allows | Scope |
|---|---|---|
| `hub.currency.add` | Add a hub settlement currency | HUB |
| `hub.signing-keys.update` | Update the hub's signing keys | HUB |
| `participant.list` | View registered participants | HUB |
| `participant.onboard` | Onboard a new FSP | HUB |
| `participant.currency.add` | Enable a currency for a participant | HUB |
| `participant.endpoint.register` | Register/replace a participant callback endpoint | HUB |
| `participant.signing-keys.update` | Update a participant's signing keys | HUB |
| `audit.transactions.list` | Search/list audited transactions | BOTH |
| `audit.transactions.view` | View one transaction in detail | BOTH |
| `admin.users.manage` | Manage portal users | HUB |
| `admin.roles.manage` | Manage roles & their permissions | HUB |
| `admin.permissions.list` | Browse the permission catalogue (read-only) | HUB |
| `admin.menus.manage` | Manage sidebar menus | HUB |

---

## 4. Function inventory

Grouped by area. "Who can use it" = the permission required (or *Public* / *Any logged-in user*).

### 4.1 Authentication & session (Area: `auth`)

| # | Function | Who can use it | Description |
|---|---|---|---|
| 1 | **Log in** | Public | Exchange email + password for an access token; a refresh token is set as a secure cookie. |
| 2 | **Refresh session** | Public (valid refresh cookie) | Get a fresh access token without re-entering the password. |
| 3 | **Log out** | Public (valid refresh cookie) | End the session and invalidate the refresh token. |
| 4 | **Change my password** | Any logged-in user | Change own password; all other sessions are signed out. |
| 5 | **View my profile** (`me`) | Any logged-in user | Returns the user's identity, role, FSP, and effective permissions. |
| 6 | **View my menu** (`me/menu`) | Any logged-in user | Returns only the sidebar items the user is allowed to see. |

### 4.2 User management (Area: `admin/users`, requires `admin.users.manage`)

| # | Function | Description |
|---|---|---|
| 1 | **List users** | Paginated list of portal users. |
| 2 | **View user** | Details of one user. |
| 3 | **Create user** | Create a user with email + role (+ FSP if the role is DFSP-scoped). |
| 4 | **Update user** | Change a user's role / FSP / status. |
| 5 | **Reset user password** | Generate a temporary password for the user (returned to the admin once); forces password change on next login. |
| 6 | **Deactivate user** | Disable the account and sign out all its sessions. |

### 4.3 Role management (Area: `admin/roles`, requires `admin.roles.manage`)

| # | Function | Description |
|---|---|---|
| 1 | **List roles** | All roles. |
| 2 | **View role** | One role's details. |
| 3 | **Create role** | Create a role (name, code, scope), optionally from a preset. |
| 4 | **Update role** | Edit a role's name/description. |
| 5 | **Delete role** | Remove a non-system role that no user is using. |
| 6 | **View role permissions** | The permissions currently granted to a role. |
| 7 | **Replace role permissions** | Set the full permission list for a role (overwrite). |
| 8 | **List role presets** | The 6 ready-made permission templates. |

### 4.4 Permission catalogue (Area: `admin/permissions`, requires `admin.permissions.list`)

| # | Function | Description |
|---|---|---|
| 1 | **List permissions** | Read-only browse of all 13 permissions. |

### 4.5 Menu management (Area: `admin/menus`, requires `admin.menus.manage`)

| # | Function | Description |
|---|---|---|
| 1 | **List menus** | All sidebar menus. |
| 2 | **View menu** | One menu's details. |
| 3 | **Create menu** | Add a sidebar item. |
| 4 | **Update menu** | Edit a sidebar item. |
| 5 | **Delete menu** | Remove a sidebar item. |
| 6 | **View menu permissions** | Which permission reveals a menu. |

### 4.6 Transaction audit (Area: `audit/transactions`)

| # | Function | Who can use it | Description |
|---|---|---|---|
| 1 | **Find transactions** | `audit.transactions.list` | Search audited transactions. **DFSP users are auto-restricted to their own FSP.** |
| 2 | **View transaction** | `audit.transactions.view` | View one transaction by ID. **DFSP users can only view their own FSP's transactions.** |

---

## 5. Function behaviour (what happens when you use each function)

This section explains what each function does and the outcome of taking the action — including the error cases.

### 5.1 Login & sessions

- **Valid login** — Submitting the correct email and password returns an access token, the user's role, FSP, and permission list, and sets a secure refresh-token cookie. The response also tells the caller whether the user must change their password.
- **Invalid login** — A wrong password is rejected with a generic "invalid credentials" message (it does not reveal whether the email or the password was the problem).
- **Account lockout** — After a configured number of consecutive failed attempts (default **5**), the account is locked for a configured duration (default **15 minutes**). During the lock, login is refused even if the correct password is entered. The threshold and duration are set by `PIVOTAL_IAM_LOGIN_LOCKOUT_THRESHOLD` and `PIVOTAL_IAM_LOGIN_LOCKOUT_MINUTES`.
- **Inactive account** — A user that has been deactivated cannot log in.
- **Forced password change** — A user flagged "must change password" (a brand-new user, or one whose password was just reset) is told so on login and is expected to change it before continuing.
- **Refresh session** — Presenting a valid refresh-token cookie returns a new access token and a new refresh-token cookie, without re-entering the password.
- **Refresh reuse / theft detection** — If an old refresh token that has already been rotated is presented again, the system treats it as possible theft and invalidates **all** of that user's sessions at once.
- **Logout** — Ends the session, invalidates the refresh token, and clears the cookie. The refresh token no longer works afterwards.

### 5.2 Real-time enforcement

- **Instant deactivation** — When an admin deactivates a user, that user's *existing* access token stops working within seconds (their next request is rejected) — the system does not wait for the token to naturally expire.
- **Password change ends sessions** — Changing or resetting a password signs the user out of all other devices/sessions.

### 5.3 Authorization & menu

- **Permission enforcement** — Every protected function checks the caller's permissions. A user without the required permission is refused.
- **My profile** (`me`) — Returns the calling user's own identity, role, FSP, and effective permission list.
- **My menu** (`me/menu`) — Returns only the sidebar items unlocked by the user's permissions. A user with no permissions receives an empty menu.

### 5.4 Data scoping (HUB vs DFSP)

- **DFSP isolation — listing** — A DFSP user listing transactions only ever receives their own FSP's records. Attempting to filter by a different FSP is rejected as a scope violation.
- **DFSP isolation — viewing** — A DFSP user cannot open a transaction that belongs to another FSP.
- **HUB visibility** — A HUB user (who has no FSP) can list and view transactions across all FSPs.

### 5.5 User management

- **Create user — HUB rule** — Creating a HUB-scoped user *with* an FSP is rejected (HUB users must not be tied to an FSP).
- **Create user — DFSP rule** — Creating a DFSP-scoped user *without* an FSP is rejected (DFSP users must be tied to exactly one FSP).
- **Create user — unique email** — Creating a user with an email that is already in use is rejected.
- **Reset password** — Generates a one-time temporary password (returned to the admin), forces the user to change it on next login, and signs the user out of all sessions.
- **Deactivate — self-protection** — An admin cannot deactivate their own account.
- **Deactivate — last admin protection** — Deactivating the final remaining active admin is refused, so the system is never left without an administrator.

### 5.6 Role management

- **System role protection** — The built-in ADMIN and DFSP_USER roles cannot be deleted.
- **Role-in-use protection** — A role that is still assigned to one or more users cannot be deleted.
- **Replace role permissions** — Sets the complete permission list for a role, overwriting whatever it had before.
- **Change-password sanity** — A password change requires the correct current password, and the new password cannot be the same as the current one.

---

## 6. Notes

- IAM governs portal/admin access only. The payment-processing services (web-outbound / web-inbound) use a separate mechanism.
- Permissions and role presets are defined in the product and seeded into the database; admins assemble roles from them but do not invent new permission keys at runtime.
- "Scope" (HUB/DFSP) is a property of the role and cannot be mixed within one account.

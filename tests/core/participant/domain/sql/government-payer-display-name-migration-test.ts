import * as assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {after, before, describe, it} from 'node:test';
import {Connection, createConnection, RowDataPacket} from 'mysql2/promise';

// Disposable schema only. Never set this to the application database.
const host = process.env.MOJ_TEST_MYSQL_HOST;
const port = Number(process.env.MOJ_TEST_MYSQL_PORT ?? '3306');
const user = process.env.MOJ_TEST_MYSQL_USER;
const password = process.env.MOJ_TEST_MYSQL_PASSWORD;
const enabled = host != null && host.length > 0 && user != null && password != null;

const database = `moj1260_mig_${randomUUID().replace(/-/g, '')}`;
const reserved = new Set(['pivotal', 'mysql', 'information_schema', 'performance_schema', 'sys']);

describe('MOJ-1260 migrations', {skip: !enabled}, () => {
    let connection: Connection;
    let databaseCreated = false;

    const sql = (relativePath: string) => readFile(resolve(__dirname, relativePath), 'utf8');

    before(async () => {
        assert.equal(reserved.has(database), false);
        assert.match(database, /^moj1260_mig_[0-9a-f]+$/);

        connection = await createConnection({
            host,
            port,
            user,
            password,
            multipleStatements: true,
        });
        await connection.query(`CREATE DATABASE \`${database}\``);
        databaseCreated = true;
        await connection.query(`USE \`${database}\``);

        const [current] = await connection.query<RowDataPacket[]>('SELECT DATABASE() AS name');
        assert.equal(current[0]?.name, database);
    });

    after(async () => {
        if (connection == null) {
            return;
        }
        try {
            if (databaseCreated && !reserved.has(database)) {
                await connection.query(`DROP DATABASE \`${database}\``);
            }
        } finally {
            await connection.end();
        }
    });

    it('leaves an existing participant row with a null government payer display name', async () => {
        await connection.query(await sql(
            '../../../../../packages/core/participant/domain/sql/V1__create_participant_table.sql',
        ));
        await connection.query(
            `INSERT INTO participant (name, jws_public_key, jws_private_key, access_public_key)
             VALUES ('existing-dfsp', 'public', 'private', 'access')`,
        );

        await connection.query(await sql(
            '../../../../../packages/core/participant/domain/sql/V6__add_government_payer_display_name.sql',
        ));

        const [columns] = await connection.query<RowDataPacket[]>(
            `SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'participant'
               AND COLUMN_NAME = 'government_payer_display_name'`,
            [database],
        );
        assert.equal(columns[0]?.DATA_TYPE, 'varchar');
        assert.equal(Number(columns[0]?.CHARACTER_MAXIMUM_LENGTH), 128);
        assert.equal(columns[0]?.IS_NULLABLE, 'YES');

        const [rows] = await connection.query<RowDataPacket[]>(
            'SELECT government_payer_display_name AS displayName FROM participant WHERE name = ?',
            ['existing-dfsp'],
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0]?.displayName, null);
    });

    it('adds the permission for an existing install, skips a fresh one, and is safe to run twice', async () => {
        await connection.query(await sql('../../../../../packages/core/auth/domain/sql/V1__create_roles.sql'));
        await connection.query(await sql('../../../../../packages/core/auth/domain/sql/V4__create_permissions.sql'));
        await connection.query(await sql('../../../../../packages/core/auth/domain/sql/V5__create_role_permissions.sql'));

        const migration = await sql(
            '../../../../../packages/core/auth/domain/sql/V15__add_government_payer_display_name_permission.sql',
        );
        await connection.query(migration);

        const [freshPermissions] = await connection.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM permissions');
        const [freshGrants] = await connection.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM role_permissions');
        assert.equal(Number(freshPermissions[0]?.total), 0);
        assert.equal(Number(freshGrants[0]?.total), 0);

        await connection.query(
            `INSERT INTO roles (id, code, name, scope, is_system) VALUES
                (1, 'ADMIN', 'Administrator', 'HUB', 1),
                (2, 'DFSP_ADMIN', 'DFSP administrator', 'DFSP', 1)`,
        );
        await connection.query(
            `INSERT INTO permissions (id, key_name, description, scope)
             VALUES (7, 'participant.access-key.update', 'Existing permission', 'HUB')`,
        );

        await connection.query(migration);
        await connection.query(migration);

        const [permissions] = await connection.query<RowDataPacket[]>(
            `SELECT id, scope FROM permissions WHERE key_name = 'participant.payer-display-name.update'`,
        );
        assert.equal(permissions.length, 1);
        assert.equal(Number(permissions[0]?.id), 8);
        assert.equal(permissions[0]?.scope, 'HUB');

        const [grants] = await connection.query<RowDataPacket[]>(
            `SELECT r.code
             FROM role_permissions rp
             JOIN roles r ON r.id = rp.role_id
             JOIN permissions p ON p.id = rp.permission_id
             WHERE p.key_name = 'participant.payer-display-name.update'
             ORDER BY r.code`,
        );
        assert.deepEqual(grants.map((row) => row.code), ['ADMIN']);
    });
});

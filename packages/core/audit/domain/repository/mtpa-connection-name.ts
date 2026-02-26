const getConnectionName = (envKey: string): string => {
    const connectionName = process.env[envKey];

    if (!connectionName) {
        throw new Error(`${envKey} is required.`);
    }

    return connectionName;
};

export const MTPA_DB_WRITE_CONNECTION_NAME = getConnectionName('MTPA_DB_WRITE_CONNECTION_NAME');
export const MTPA_DB_READ_CONNECTION_NAME = getConnectionName('MTPA_DB_READ_CONNECTION_NAME');

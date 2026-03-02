import {resolve} from 'node:path';
import {config as loadDotEnv} from 'dotenv';

// Loads NATS_URL, DB_WRITE_*, etc. from the consumer app's .env so tests
// can connect to the same NATS server and database the consumer is using.
loadDotEnv({path: resolve(process.cwd(), 'packages/core/audit/consumer/.env')});

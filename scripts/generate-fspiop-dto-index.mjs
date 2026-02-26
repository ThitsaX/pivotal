import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DTO_DIR = 'packages/shared/fspiop/dto';
const INDEX_FILE = join(DTO_DIR, 'index.ts');

const files = readdirSync(DTO_DIR)
  .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
  .filter((file) => statSync(join(DTO_DIR, file)).isFile())
  .sort((a, b) => a.localeCompare(b))
  .map((file) => file.replace(/\.ts$/, ''));

const lines = files.map((name) => `export * from './${name}';`);
const content = lines.length > 0 ? `${lines.join('\n')}\n` : '';

writeFileSync(INDEX_FILE, content, { encoding: 'utf8' });

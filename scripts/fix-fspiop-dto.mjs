import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DTO_DIR = 'packages/shared/fspiop/dto';

const files = readdirSync(DTO_DIR)
  .filter((file) => file.endsWith('.ts'))
  .filter((file) => statSync(join(DTO_DIR, file)).isFile());

for (const file of files) {
  const filePath = join(DTO_DIR, file);
  const original = readFileSync(filePath, { encoding: 'utf8' });

  let fixed = original;

  fixed = fixed.replaceAll('&amp;', '&');

  fixed = fixed.replace(
    /^import\s+\{\s*(string|number|boolean|bigint)\s*&\s*object\s*\}\s+from\s+['"][^'"]+['"];\n/gm,
    '',
  );

  fixed = fixed.replace(
    /^import\s+\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*&\s*object\s*\}\s+from\s+['"]\.\/([a-z0-9-]+)-object['"];\n/gm,
    "import { $1 } from './$2';\n",
  );

  fixed = fixed.replace(
    /\b(string|number|boolean|bigint)\s*&\s*object\b/g,
    '$1',
  );

  fixed = fixed.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\s*&\s*object\b/g, '$1');

  if (fixed !== original) {
    writeFileSync(filePath, fixed, { encoding: 'utf8' });
  }
}

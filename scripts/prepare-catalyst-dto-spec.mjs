import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE_SPEC_FILE = 'packages/shared/catalyst/spec/catalyst.yaml';
const PACKAGE_PREFIX = 'com.thitsaworks.catalyst.core.policy.domain.';

const source = readFileSync(SOURCE_SPEC_FILE, { encoding: 'utf8' });

const schemaNames = [...source.matchAll(
  /com\.thitsaworks\.catalyst\.core\.policy\.domain\.(?:command|data)\.[A-Za-z0-9_.]+/g,
)].map((match) => match[0]);

const uniqueSchemaNames = [...new Set(schemaNames)];
const schemaNameMappings = new Map();
const normalizedNameOwners = new Map();

for (const schemaName of uniqueSchemaNames) {
  const normalizedName = normalizeSchemaName(schemaName);
  const owner = normalizedNameOwners.get(normalizedName);

  if (owner != null && owner !== schemaName) {
    throw new Error(
      `Schema name collision detected after normalization: '${schemaName}' and '${owner}' both map to '${normalizedName}'.`,
    );
  }

  normalizedNameOwners.set(normalizedName, schemaName);
  schemaNameMappings.set(schemaName, normalizedName);
}

const sortedMappings = [...schemaNameMappings.entries()]
  .sort((left, right) => right[0].length - left[0].length);

let normalizedSpec = source;

for (const [originalName, normalizedName] of sortedMappings) {
  normalizedSpec = normalizedSpec.split(originalName).join(normalizedName);
}

writeFileSync(SOURCE_SPEC_FILE, normalizedSpec, { encoding: 'utf8' });

function normalizeSchemaName(schemaName) {
  if (!schemaName.startsWith(PACKAGE_PREFIX)) {
    return schemaName;
  }

  const domainScopedName = schemaName.slice(PACKAGE_PREFIX.length);

  if (domainScopedName.startsWith('command.')) {
    return domainScopedName.slice('command.'.length);
  }

  if (domainScopedName.startsWith('data.')) {
    return domainScopedName.slice('data.'.length);
  }

  return schemaName;
}

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DTO_DIR = 'packages/shared/catalyst/dto';

const files = readdirSync(DTO_DIR)
  .filter((file) => file.endsWith('.ts'))
  .filter((file) => statSync(join(DTO_DIR, file)).isFile());

const enumNames = new Set();
for (const file of files) {
  const content = readFileSync(join(DTO_DIR, file), { encoding: 'utf8' });
  for (const match of content.matchAll(/^export enum (\w+)/gm)) {
    enumNames.add(match[1]);
  }
}

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

  fixed = fixed.replace(/\b(string|number|boolean|bigint)\s*&\s*object\b/g, '$1');
  fixed = fixed.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\s*&\s*object\b/g, '$1');

  if (fixed.includes('export interface ')) {
    if (!fixed.includes("from '@nestjs/swagger'")) {
      const importMatches = [...fixed.matchAll(/^import[^\n]+\n/gm)];
      if (importMatches.length > 0) {
        const last = importMatches.at(-1);
        const insertAt = (last.index ?? 0) + last[0].length;
        fixed = fixed.slice(0, insertAt) + "import { ApiProperty } from '@nestjs/swagger';\n" + fixed.slice(insertAt);
      } else {
        fixed = `import { ApiProperty } from '@nestjs/swagger';\n${fixed}`;
      }
    }

    fixed = fixed.replace(/^export interface (\w+)(\s*\{)/gm, 'export class $1$2');

    fixed = addApiPropertyDecorators(fixed, enumNames);
  }

  if (fixed !== original) {
    writeFileSync(filePath, fixed, { encoding: 'utf8' });
  }
}

function addApiPropertyDecorators(content, enumNames) {
  const lines = content.split('\n');
  const result = [];
  let braceDepth = 0;
  let inClass = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;

    if (/^export class \w+/.test(line)) {
      inClass = true;
      braceDepth = 0;
    }

    const depthBefore = braceDepth;
    braceDepth += opens - closes;

    if (inClass && depthBefore === 1) {
      const propMatch = line.match(/^(\s+)(?:readonly\s+)?(\w+)(\??):\s*(.+?)\s*;(\s*)$/);
      if (propMatch) {
        const [, indent, propName, optional, typeStr] = propMatch;

        const previousLine = result.at(-1) ?? '';
        if (!previousLine.includes('@ApiProperty')) {
          const decorator = buildDecorator(typeStr.trim(), optional === '?', enumNames);
          result.push(`${indent}${decorator}`);
        }

        const newLine =
          optional === '?'
            ? line
            : line.replace(new RegExp(`(\\b${propName}\\b):`), '$1!:');
        result.push(newLine);
        continue;
      }
    }

    if (inClass && braceDepth === 0) {
      inClass = false;
    }

    result.push(line);
  }

  return result.join('\n');
}

function buildDecorator(typeStr, isOptional, enumNames) {
  const parts = [];

  if (/^\{\s*\[.+\]:\s*.+;\s*\}$/.test(typeStr) || /^Record<.+>$/.test(typeStr)) {
    parts.push('type: Object');
    if (isOptional) parts.push('required: false');
    return `@ApiProperty({${parts.join(', ')}})`;
  }

  let elementType = typeStr;
  let isArray = false;
  const arrOfMatch = typeStr.match(/^Array<(.+)>$/);
  const arrBracketMatch = typeStr.match(/^(.+)\[\]$/);
  if (arrOfMatch) {
    elementType = arrOfMatch[1].trim();
    isArray = true;
  } else if (arrBracketMatch) {
    elementType = arrBracketMatch[1].trim();
    isArray = true;
  }

  if (elementType.includes(' | ')) {
    const candidates = elementType
      .split(' | ')
      .map((t) => t.trim())
      .filter((t) => t !== 'null' && t !== 'undefined' && t !== 'object');
    elementType = candidates[0] ?? 'string';
  }

  if (elementType === 'string') {
    parts.push('type: String');
  } else if (elementType === 'number') {
    parts.push('type: Number');
  } else if (elementType === 'boolean') {
    parts.push('type: Boolean');
  } else if (enumNames.has(elementType)) {
    parts.push('type: String');
  } else {
    parts.push(`type: () => ${elementType}`);
  }

  if (isArray) parts.push('isArray: true');
  if (isOptional) parts.push('required: false');

  return `@ApiProperty({${parts.join(', ')}})`;
}

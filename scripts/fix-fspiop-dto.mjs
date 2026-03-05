import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DTO_DIR = 'packages/shared/fspiop/dto';

const files = readdirSync(DTO_DIR)
  .filter((file) => file.endsWith('.ts'))
  .filter((file) => statSync(join(DTO_DIR, file)).isFile());

// Step 1: Identify which type names are enums (vs interfaces/classes)
const enumNames = new Set();
for (const file of files) {
  const content = readFileSync(join(DTO_DIR, file), { encoding: 'utf8' });
  for (const match of content.matchAll(/^export enum (\w+)/gm)) {
    enumNames.add(match[1]);
  }
}

// Step 2: Process each file
for (const file of files) {
  const filePath = join(DTO_DIR, file);
  const original = readFileSync(filePath, { encoding: 'utf8' });

  let fixed = original;

  // Existing fixes
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

  // Convert interfaces to decorated classes
  if (fixed.includes('export interface ')) {
    // Add @nestjs/swagger import after the last existing import
    if (!fixed.includes("from '@nestjs/swagger'")) {
      const importMatches = [...fixed.matchAll(/^import[^\n]+\n/gm)];
      if (importMatches.length > 0) {
        const last = importMatches.at(-1);
        const insertAt = (last.index ?? 0) + last[0].length;
        fixed = fixed.slice(0, insertAt) + "import { ApiProperty } from '@nestjs/swagger';\n" + fixed.slice(insertAt);
      }
    }

    // Convert interface declaration to class
    fixed = fixed.replace(/^export interface (\w+)(\s*\{)/gm, 'export class $1$2');

    // Add @ApiProperty before each property inside the class body
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

    // Only process direct members of the class (depth 1)
    if (inClass && depthBefore === 1) {
      // Match property: [readonly] name[?]: Type;
      const propMatch = line.match(/^(\s+)(?:readonly\s+)?(\w+)(\??):\s*(.+?)\s*;(\s*)$/);
      if (propMatch) {
        const [, indent, propName, optional, typeStr] = propMatch;

        // Guard: don't add @ApiProperty if one is already directly above
        const recentLines = result.slice(-3);
        if (!recentLines.some((l) => l.includes('@ApiProperty'))) {
          const decorator = buildDecorator(typeStr.trim(), optional === '?', enumNames);
          result.push(`${indent}${decorator}`);
        }

        // Add definite-assignment assertion (!) for required properties
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

  // Unwrap arrays: Array<X> or X[]
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

  // Resolve union types: pick the first non-null/undefined candidate
  if (elementType.includes(' | ')) {
    const candidates = elementType
      .split(' | ')
      .map((t) => t.trim())
      .filter((t) => t !== 'null' && t !== 'undefined' && t !== 'object');
    elementType = candidates[0] ?? 'string';
  }

  // Map to @ApiProperty type option
  if (elementType === 'string') {
    parts.push('type: String');
  } else if (elementType === 'number') {
    parts.push('type: Number');
  } else if (elementType === 'boolean') {
    parts.push('type: Boolean');
  } else if (enumNames.has(elementType)) {
    parts.push(`enum: ${elementType}, enumName: '${elementType}'`);
  } else {
    // Complex type — will be a class after conversion, use lazy reference
    parts.push(`type: () => ${elementType}`);
  }

  if (isArray) parts.push('isArray: true');
  if (isOptional) parts.push('required: false');

  return `@ApiProperty({${parts.join(', ')}})`;
}

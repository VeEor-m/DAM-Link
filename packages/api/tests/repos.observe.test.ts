import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the "every repo async function is wrapped with observeSql"
 * invariant. Pure static analysis — reads source files and counts
 * `observeSql(` calls vs `export async function` declarations.
 *
 * If a future maintainer adds a new repo function but forgets to
 * wrap it, this test fails with a clear "N functions, M wraps" gap.
 */
const REPO_FILES = [
  'src/repositories/assets.repo.ts',
  'src/repositories/memberships.repo.ts',
  'src/repositories/orgs.repo.ts',
  'src/repositories/sessions.repo.ts',
  'src/repositories/share-links.repo.ts',
  'src/repositories/users.repo.ts',
  'src/db/repositories/health.repo.ts',
];

describe('repo files — every exported async function is wrapped with observeSql', () => {
  for (const relPath of REPO_FILES) {
    it(`${relPath} uses observeSql in every exported async function`, () => {
      const full = join(process.cwd(), relPath);
      const src = readFileSync(full, 'utf8');

      const fnMatches = src.match(/export async function \w+/g) ?? [];
      const wrapMatches = src.match(/observeSql\(/g) ?? [];

      expect(fnMatches.length).toBeGreaterThan(0);
      expect(wrapMatches.length).toBeGreaterThanOrEqual(fnMatches.length);
    });
  }
});

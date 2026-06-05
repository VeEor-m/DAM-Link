const MAX_SLUG_LENGTH = 80;

/** Convert a free-form name to a URL-safe slug. */
export function slugify(input: string): string {
  const normalized = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const trimmed = normalized.slice(0, MAX_SLUG_LENGTH).replace(/-$/, '');
  return trimmed || 'org';
}

/** Append a collision counter: `foo` → `foo-2`, `foo-2` → `foo-3`, etc. */
export function withCollisionSuffix(base: string, attempt: number): string {
  const suffix = `-${attempt + 1}`;
  const budget = MAX_SLUG_LENGTH - suffix.length;
  return `${base.slice(0, budget)}${suffix}`;
}

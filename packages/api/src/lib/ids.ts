import { randomUUID, randomBytes } from 'node:crypto';

/** UUID v4 for row IDs. */
export const newId = (): string => randomUUID();

/** URL-safe base64 token, used for session IDs and share-link tokens. */
export const newToken = (bytes = 32): string =>
  randomBytes(bytes).toString('base64url');

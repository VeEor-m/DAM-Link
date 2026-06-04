import type { App } from '../types.js';
import type { ZodSchema } from 'zod';

/**
 * Check if a value is a Zod schema (has `_def` with `typeName: 'ZodObject'`).
 */
function isZodSchema(value: unknown): value is ZodSchema {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_def' in value &&
    typeof (value as { _def?: unknown })._def === 'object' &&
    (value as { _def?: { typeName?: string } })._def?.typeName === 'ZodObject'
  );
}

/**
 * Custom validator compiler that handles Zod schemas.
 *
 * For Zod schemas, the validation is delegated to the handler via
 * `RegisterInputSchema.parse(req.body)`. The route's body schema is still
 * required for OpenAPI documentation, but we skip Fastify's default Ajv
 * compilation for Zod schemas (which fails because Zod schemas are not
 * valid JSON schemas).
 *
 * For non-Zod schemas, we fall back to a permissive no-op validator.
 */
export function registerZodValidator(app: App): void {
  app.setValidatorCompiler(({ schema }) => {
    if (isZodSchema(schema)) {
      // Zod validation is done in the handler. Return a no-op validator.
      return () => ({ value: undefined });
    }
    // For non-Zod schemas, return a no-op that lets raw data through.
    // (Fastify's default Ajv compiler was set during `setupValidator` and
    //  would have been used instead, but we replace it here.)
    return (data: unknown) => ({ value: data });
  });
}

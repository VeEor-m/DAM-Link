// ESLint 9 flat config for the DAM-Link-Backend monorepo.
// This file is required because ESLint 9 dropped native support for .eslintrc.* files.
// The legacy .eslintrc.cjs is preserved at the repo root (per Plan 9 spec) for reference,
// but ESLint itself uses this flat config. Add additional rules here as the codebase matures.
module.exports = [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/drizzle/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
    },
    rules: {
      // Equivalent to eslint:recommended for the TS subset we care about.
      // The base no-unused-vars is replaced by the @typescript-eslint variant.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
];

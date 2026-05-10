// backend/eslint.config.js — flat config for ESLint 10.
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'migrations/**', 'coverage/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // tsc strict mode (noUnusedLocals/Parameters) already catches these;
      // eslint flagging them again is just noise.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // we use `any` deliberately at a few boundaries (zod types, drizzle internals).
      '@typescript-eslint/no-explicit-any': 'warn',
      // Express's Request type augmentation requires `declare global { namespace Express ... }` —
      // the established TS pattern for module augmentation. Allow declaration namespaces.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
  },
];

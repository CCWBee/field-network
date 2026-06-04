module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended'],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    'no-unused-vars': 'off',
    'no-undef': 'off',
    '@typescript-eslint/no-unused-vars': 'warn',
    // Base no-redeclare doesn't understand TypeScript function overload
    // signatures (e.g. createStorageProvider in services/storage/index.ts).
    // The typescript-eslint variant does.
    'no-redeclare': 'off',
    '@typescript-eslint/no-redeclare': 'error',
  },
  ignorePatterns: ['dist/', 'node_modules/', '.next/', 'artifacts/', 'typechain-types/'],
};

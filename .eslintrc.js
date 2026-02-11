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
  },
  ignorePatterns: ['dist/', 'node_modules/', '.next/', 'artifacts/', 'typechain-types/'],
};

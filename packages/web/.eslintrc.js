module.exports = {
  extends: ['next/core-web-vitals'],
  rules: {
    // Enforce prisma boundary - prevent direct prisma imports in web package
    // All database access should go through the API layer
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@prisma/*', '**/prisma/*', '@prisma/client'],
            message:
              'Direct Prisma imports are not allowed in the web package. Use the API layer instead.',
          },
        ],
      },
    ],
  },
};

import nextConfig from "eslint-config-next";

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...nextConfig,
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    rules: {
      // Phase 2 audit checks migrated to CI (Step 1 - foundation)
      // Critical rules - enabled immediately:
      "@typescript-eslint/no-explicit-any": "error",
      "no-empty": ["error", { allowEmptyCatch: false }],
      
      // Additional rules will be enabled in subsequent PRs after codebase cleanup:
      // - max-lines: [warn, 200]
      // - max-lines-per-function: [warn, 50]
      // - no-console: error
      // - no-warning-comments: warn
    },
  },
];

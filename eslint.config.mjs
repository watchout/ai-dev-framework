import nextConfig from "eslint-config-next";

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...nextConfig,
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    rules: {},
  },
];

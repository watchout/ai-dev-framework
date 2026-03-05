import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: ["**/*.test.ts", "**/dist/**", "src/dashboard/**"],
      thresholds: { lines: 70, functions: 70, branches: 60 },
    },
  },
});

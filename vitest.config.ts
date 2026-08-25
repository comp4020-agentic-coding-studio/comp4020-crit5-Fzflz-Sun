import { defineConfig } from "vitest/config";

// Vitest's default file discovery matches both *.test.ts and *.spec.ts
// anywhere in the repo, which would also pick up e2e/*.spec.ts — those are
// Playwright tests (playwright.config.ts), not Vitest ones, and the two
// frameworks' test.describe() collide if both try to run the same file.
export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts"],
  },
});

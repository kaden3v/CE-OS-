import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "supabase/functions/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Coverage only counts files a test actually imports, so this figure
      // flatters the app: src/lib is genuinely well covered while most pages
      // have no test at all. These thresholds are a ratchet set just under
      // today's numbers — they stop coverage regressing, and should be raised
      // as the UI layer gets tests. They are NOT a claim that 55% is enough.
      thresholds: {
        statements: 55,
        branches: 54,
        functions: 60,
        lines: 56,
      },
    },
  },
});

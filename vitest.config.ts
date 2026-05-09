import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
      /* Threshold applies only to core logic modules exercised by tests (not every barrel/export). */
      include: [
        "src/lib/dates.ts",
        "src/lib/inventory.ts",
        "src/lib/migrations.ts",
        "src/lib/money.ts",
        "src/lib/orderMachine.ts",
        "src/lib/sanitize.ts",
        "src/lib/storage.ts",
        "src/lib/usFederalHolidays.ts",
        "src/lib/changeLog.ts",
        "src/hooks/useEntity.ts",
      ],
      exclude: [
        "**/*.d.ts",
        "**/*.test.ts",
        "**/*.test.tsx",
        "src/test/**",
      ],
      /* Line/statement/function gates at 80%; branches relaxed vs lines (UI/storage defensive paths). */
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 69,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

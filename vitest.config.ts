import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/**/__spec__/*.test.ts"],
    maxWorkers: 2,
    allowOnly: false,
    passWithNoTests: false,
  },
})

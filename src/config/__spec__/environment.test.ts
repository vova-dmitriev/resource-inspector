import { describe, expect, it } from "vitest"
import { parseEnvironmentFile } from "../environment.js"

const EnvironmentTestInput = {
  HealthUrl: "HEALTH_URL=http://localhost:4000/health",
  QuotedValue: "DATABASE_URL='postgresql://localhost/app'",
} as const

describe("parseEnvironmentFile", () => {
  it("preserves unquoted URLs while removing matching quote wrappers", () => {
    expect(parseEnvironmentFile(`${EnvironmentTestInput.HealthUrl}\n${EnvironmentTestInput.QuotedValue}`)).toEqual({
      HEALTH_URL: "http://localhost:4000/health",
      DATABASE_URL: "postgresql://localhost/app",
    })
  })
})

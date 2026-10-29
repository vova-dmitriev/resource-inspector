import { describe, expect, it } from "vitest"
import { redact } from "../redaction.js"

const Redacted = "[REDACTED]"

describe("redact", () => {
  it("removes credentials, personal identifiers, and payment data from nested values", () => {
    expect(
      redact({
        authorization: "Bearer secret-token",
        profile: {
          first_name: "Irina",
          passport_number: "P123456",
          card_number: "4111111111111111",
        },
        refresh_token: "sensitive",
        orderId: "order-1",
      }),
    ).toEqual({
      authorization: Redacted,
      profile: {
        first_name: Redacted,
        passport_number: Redacted,
        card_number: Redacted,
      },
      refresh_token: Redacted,
      orderId: "order-1",
    })
  })
})

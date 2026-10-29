import { describe, expect, it, vi } from "vitest"
import { createHttpHistoryMiddleware } from "../http-history.js"

const TestPolicy = {
  RequestId: "request-123",
  CompletedMessage: "HTTP request completed",
  ExpectedRedacted: "[REDACTED]",
  LargePayloadCharacters: 8_000,
} as const

describe("createHttpHistoryMiddleware", () => {
  it("records redacted JSON request/response bodies only when enabled", () => {
    const info = vi.fn()
    let finish = () => {}
    const request = {
      method: "POST",
      url: "/api/orders?draft=true",
      headers: {
        "x-request-id": TestPolicy.RequestId,
        "content-type": "application/json",
      },
      body: { first_name: "Irina", orderId: "order-1" },
    }
    const response = {
      statusCode: 201,
      get: (name: string) => (name === "content-type" ? "application/json; charset=utf-8" : undefined),
      setHeader: vi.fn(),
      once: (_event: string, callback: () => void) => {
        finish = callback
      },
      send: (body: unknown) => body,
    }

    createHttpHistoryMiddleware({ info }, true)(request, response, vi.fn())
    response.send({ passport_number: "P123", status: "accepted" })
    finish()

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: TestPolicy.RequestId,
        path: "/api/orders",
        input: { first_name: TestPolicy.ExpectedRedacted, orderId: "order-1" },
        output: {
          passport_number: TestPolicy.ExpectedRedacted,
          status: "accepted",
        },
      }),
      TestPolicy.CompletedMessage,
    )
  })

  it("omits bodies by default and truncates over-limit UTF-8 payloads", () => {
    const info = vi.fn()
    let finish = () => {}
    const request = {
      method: "POST",
      url: "/api/orders",
      headers: { "content-type": "application/json" },
      body: { note: "😀".repeat(TestPolicy.LargePayloadCharacters) },
    }
    const response = {
      statusCode: 200,
      setHeader: vi.fn(),
      once: (_event: string, callback: () => void) => {
        finish = callback
      },
    }

    createHttpHistoryMiddleware({ info }, false)(request, response, vi.fn())
    finish()

    expect(info.mock.calls[0]?.[0]).not.toHaveProperty("input")

    createHttpHistoryMiddleware({ info }, true)(request, response, vi.fn())
    finish()

    expect(info.mock.calls[1]?.[0]).toMatchObject({
      input: { truncated: true },
    })
  })
})

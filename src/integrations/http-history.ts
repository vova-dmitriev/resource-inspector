import { randomUUID } from "node:crypto"
import { redact } from "../security/redaction.js"

const RequestHistoryPolicy = {
  MaximumPayloadBytes: 16_384,
  CaptureEnvironmentKey: "INSPECTOR_CAPTURE_HTTP_PAYLOADS",
  RequestIdPattern: /^[a-zA-Z0-9_-]{1,128}$/,
  CompletedMessage: "HTTP request completed",
  UnavailableMarker: "unavailable",
} as const

type HttpRequest = Readonly<{
  method: string
  url: string
  headers: Readonly<Record<string, string | readonly string[] | undefined>>
  body?: unknown
}>

type HttpResponse = {
  statusCode: number
  setHeader(name: string, value: string): void
  once(event: string, handler: () => void): void
  get?(name: string): string | undefined
  send?(body: unknown): unknown
}

export type HttpHistoryLogger = Readonly<{
  info(record: Readonly<Record<string, unknown>>, message: string): void
}>

export function createHttpHistoryMiddleware(
  logger: HttpHistoryLogger,
  captureBodies = process.env[RequestHistoryPolicy.CaptureEnvironmentKey] === "true",
) {
  return (request: HttpRequest, response: HttpResponse, next: () => void) => {
    const suppliedRequestId = request.headers["x-request-id"]
    const requestId =
      typeof suppliedRequestId === "string" && RequestHistoryPolicy.RequestIdPattern.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID()
    const startedAt = Date.now()
    let output: unknown

    response.setHeader("x-request-id", requestId)

    if (captureBodies && response.send) {
      const send = response.send

      response.send = function (body: unknown) {
        output = isJson(response.get?.("content-type")) ? boundedJson(body) : undefined

        return send.call(response, body)
      }
    }

    response.once("finish", () => {
      const record: Record<string, unknown> = {
        requestId,
        method: request.method,
        path: request.url.split("?")[0],
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      }

      if (captureBodies && isJson(request.headers["content-type"])) record.input = boundedJson(request.body)
      if (output !== undefined) record.output = output

      logger.info(record, RequestHistoryPolicy.CompletedMessage)
    })

    next()
  }
}

function isJson(value: string | readonly string[] | undefined) {
  return typeof value === "string" && value.toLowerCase().includes("application/json")
}

function boundedJson(value: unknown) {
  if (value === undefined) return undefined

  try {
    const serialized = JSON.stringify(redact(value))

    if (serialized === undefined) return { [RequestHistoryPolicy.UnavailableMarker]: true }

    if (Buffer.byteLength(serialized, "utf8") > RequestHistoryPolicy.MaximumPayloadBytes) return { truncated: true }

    return JSON.parse(serialized) as unknown
  } catch {
    return { [RequestHistoryPolicy.UnavailableMarker]: true }
  }
}

import type { IncomingMessage, ServerResponse } from "node:http"

const OperationalText = {
  LocalViewerOnly: "Local viewer only",
  InvalidOrigin: "Invalid origin",
  JSONRequired: "JSON required",
  RequestIsTooLarge: "Request is too large",
  JSONObjectRequired: "JSON object required",
  ResponseIsTooLarge: "Response is too large",
} as const

const ViewerHttpPolicy = {
  MaximumBodyBytes: 16_384,
  MaximumResponseBytes: 1_048_576,
  Status: { TooLarge: 413 },
  LoopbackAddresses: ["127.0.0.1", "localhost", "[::1]"],
  JsonContentType: "application/json; charset=utf-8",
  NoStore: "no-store",
  Nosniff: "nosniff",
} as const

export async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers["content-type"]?.includes("application/json")) throw new Error(OperationalText.JSONRequired)
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)

    size += buffer.length

    if (size > ViewerHttpPolicy.MaximumBodyBytes) throw new Error(OperationalText.RequestIsTooLarge)
    chunks.push(buffer)
  }

  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))

  if (!isRecord(value)) throw new Error(OperationalText.JSONObjectRequired)

  return value
}

export function sendJson(response: ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(value) ?? "null"

  if (Buffer.byteLength(body, "utf8") > ViewerHttpPolicy.MaximumResponseBytes) {
    response.writeHead(ViewerHttpPolicy.Status.TooLarge, {
      "content-type": ViewerHttpPolicy.JsonContentType,
      "cache-control": ViewerHttpPolicy.NoStore,
    })
    response.end(JSON.stringify({ error: OperationalText.ResponseIsTooLarge }))

    return
  }

  response.writeHead(status, {
    "content-type": ViewerHttpPolicy.JsonContentType,
    "cache-control": ViewerHttpPolicy.NoStore,
    "x-content-type-options": ViewerHttpPolicy.Nosniff,
  })
  response.end(body)
}

export function isLocalHost(value: string | undefined): value is string {
  if (!value) return false

  try {
    const parsed = new URL(`http://${value}`)

    return (
      parsed.host === value &&
      ViewerHttpPolicy.LoopbackAddresses.includes(parsed.hostname as (typeof ViewerHttpPolicy.LoopbackAddresses)[number])
    )
  } catch {
    return false
  }
}

export function isValidOrigin(origin: string | undefined, host: string | undefined) {
  if (!origin) return true
  if (!host) return false

  try {
    const parsed = new URL(origin)

    return (
      parsed.origin === `http://${host}` &&
      ViewerHttpPolicy.LoopbackAddresses.includes(parsed.hostname as (typeof ViewerHttpPolicy.LoopbackAddresses)[number])
    )
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

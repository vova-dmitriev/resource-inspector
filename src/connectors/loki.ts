import type { ConnectorConfiguration, ResourceConnector } from "../model/types.js"
import { redact } from "../security/redaction.js"

const OperationalText = {
  UnsupportedLogView: "Unsupported log view",
  LogServiceRequestFailed: "Log service request failed",
  LogServiceBindingsAreRequired: "Log service bindings are required",
  UnknownLogResource: "Unknown log resource",
} as const

const LokiPolicy = {
  DefaultLimit: 100,
  MaximumLimit: 200,
  DefaultRangeMinutes: 60,
  MaximumRangeMinutes: 1_440,
  TimeoutMs: 5_000,
  MillisecondsPerMinute: 60_000,
  NanosecondsPerMillisecond: 1_000_000,
} as const

type LokiValues = Readonly<{
  result?: readonly Readonly<{
    values?: readonly (readonly [string, string])[]
  }>[]
}>

type LokiOptions = Readonly<{
  endpoint: string
  token?: string
  fetcher?: typeof fetch
}>

export function createLokiConnector(configuration: ConnectorConfiguration, { endpoint, token, fetcher = fetch }: LokiOptions) {
  const services = readServiceBindings(configuration)
  const resources = configuration.resources.map((resource) => ({
    ...resource,
    views: ["status", "logs", "requests"],
  }))

  return {
    resources,
    async status(resourceId: string) {
      await query(serviceName(services, resourceId), "logs", { limit: 1, minutes: 1 }, endpoint, token, fetcher)

      return { state: "running" as const, checkedAt: new Date().toISOString() }
    },
    async inspect(resourceId: string, view: string, input: Readonly<Record<string, unknown>> = {}) {
      if (view !== "logs" && view !== "requests") throw new Error(OperationalText.UnsupportedLogView)
      const entries = await query(serviceName(services, resourceId), view, input, endpoint, token, fetcher)

      return { entries }
    },
  } satisfies ResourceConnector
}

async function query(
  service: string,
  view: string,
  input: Readonly<Record<string, unknown>>,
  endpoint: string,
  token: string | undefined,
  fetcher: typeof fetch,
) {
  const requestedLimit = Number(input.limit ?? LokiPolicy.DefaultLimit)

  const limit = Math.max(
    1,
    Math.min(LokiPolicy.MaximumLimit, Math.floor(Number.isFinite(requestedLimit) ? requestedLimit : LokiPolicy.DefaultLimit)),
  )

  const requestedMinutes = Number(input.minutes ?? LokiPolicy.DefaultRangeMinutes)

  const minutes = Math.max(
    1,
    Math.min(
      LokiPolicy.MaximumRangeMinutes,
      Math.floor(Number.isFinite(requestedMinutes) ? requestedMinutes : LokiPolicy.DefaultRangeMinutes),
    ),
  )

  const now = Date.now()
  const selector = `{service_name="${service}"}`
  const filter = view === "requests" ? ' | json | msg="HTTP request completed"' : " | json"
  const url = new URL("/loki/api/v1/query_range", ensureTrailingSlash(endpoint))

  url.search = new URLSearchParams({
    query: `${selector}${filter}`,
    start: String((now - minutes * LokiPolicy.MillisecondsPerMinute) * LokiPolicy.NanosecondsPerMillisecond),
    end: String(now * LokiPolicy.NanosecondsPerMillisecond),
    limit: String(limit),
    direction: "backward",
  }).toString()

  const headers = new Headers({ accept: "application/json" })

  if (token) headers.set("authorization", `Bearer ${token}`)

  let response: Response

  try {
    response = await fetcher(url, {
      headers,
      signal: AbortSignal.timeout(LokiPolicy.TimeoutMs),
    })
  } catch {
    throw new Error(OperationalText.LogServiceRequestFailed)
  }

  if (!response.ok) throw new Error(OperationalText.LogServiceRequestFailed)

  const payload = (await response.json()) as { data?: LokiValues }
  const values = payload.data?.result?.flatMap(({ values: entries = [] }) => entries) ?? []

  return values.slice(0, limit).map(([timestamp, line]) => parseLogEntry(timestamp, line))
}

function readServiceBindings(configuration: ConnectorConfiguration) {
  const value = configuration.options?.services

  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(OperationalText.LogServiceBindingsAreRequired)

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && /^[a-zA-Z0-9_.-]{1,128}$/.test(entry[1]),
    ),
  )
}

function serviceName(services: Readonly<Record<string, string>>, resourceId: string) {
  const service = services[resourceId]

  if (!service) throw new Error(OperationalText.UnknownLogResource)

  return service
}

function parseLogEntry(timestamp: string, line: string) {
  try {
    const value: unknown = JSON.parse(line)

    if (value && typeof value === "object" && !Array.isArray(value)) return redact({ timestamp, ...value })
  } catch {
    return redact({ timestamp, message: line })
  }

  return redact({ timestamp, message: line })
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`
}

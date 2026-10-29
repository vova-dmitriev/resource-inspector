import type { ConnectorConfiguration, ResourceConnector } from "../model/types.js"

const OperationalText = {
  UnknownProcessResource: "Unknown process resource",
  HealthCheckFailed: "Health check failed",
  UnsupportedProcessView: "Unsupported process view",
  ProcessHealthTargetsAreRequired: "Process health targets are required",
  InvalidProcessHealthTarget: "Invalid process health target",
} as const

const HealthPolicy = { TimeoutMs: 2_500 } as const

export function createHttpHealthConnector(configuration: ConnectorConfiguration, fetcher: typeof fetch = fetch) {
  const targets = readTargets(configuration)
  const resources = configuration.resources.map((resource) => ({
    ...resource,
    views: ["status"],
  }))

  async function status(resourceId: string) {
    const target = targets[resourceId]

    if (!target) throw new Error(OperationalText.UnknownProcessResource)

    try {
      const response = await fetcher(target, {
        method: "GET",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(HealthPolicy.TimeoutMs),
      })

      return {
        state: response.ok ? ("running" as const) : ("unreachable" as const),
        checkedAt: new Date().toISOString(),
      }
    } catch {
      return {
        state: "unreachable" as const,
        checkedAt: new Date().toISOString(),
        detail: OperationalText.HealthCheckFailed,
      }
    }
  }

  return {
    resources,
    status,
    async inspect(resourceId: string, view: string) {
      if (view !== "status") throw new Error(OperationalText.UnsupportedProcessView)

      return status(resourceId)
    },
  } satisfies ResourceConnector
}

function readTargets(configuration: ConnectorConfiguration) {
  const value = configuration.options?.targets

  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(OperationalText.ProcessHealthTargetsAreRequired)
  const targets = Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"))

  for (const target of Object.values(targets)) {
    try {
      const url = new URL(target)

      if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) throw new Error()
    } catch {
      throw new Error(OperationalText.InvalidProcessHealthTarget)
    }
  }

  return targets
}

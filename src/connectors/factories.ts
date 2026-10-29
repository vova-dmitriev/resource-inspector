import type { ConnectorFactory } from "../model/types.js"
import { createBullMqConnector } from "./bullmq.js"
import { createDockerConnector } from "./docker.js"
import { createHttpHealthConnector } from "./http-health.js"
import { createLokiConnector } from "./loki.js"
import { createPostgresConnector } from "./postgres.js"

const OperationalText = {
  ConnectorTypeAlreadyRegistered: "Connector type is already registered",
} as const

export function createConnectorFactories(
  environment: Readonly<Record<string, string>>,
  additional: Readonly<Record<string, ConnectorFactory>> = {},
) {
  const builtIns = {
    docker: createDockerConnector,
    "http-health": (configuration) => {
      const defaults = configuration.options?.targets

      const targets = Object.fromEntries(
        Object.entries(defaults && typeof defaults === "object" ? defaults : {}).map(([resourceId, url]) => {
          const envName = configuration.environment?.[resourceId]
          const resolved = envName ? environment[envName] : undefined

          return [resourceId, resolved || url]
        }),
      )

      return createHttpHealthConnector({
        ...configuration,
        options: { ...configuration.options, targets },
      })
    },
    postgres: (configuration) =>
      createPostgresConnector(configuration, {
        connectionString: resolveValue(configuration, "connectionString", environment),
      }),
    bullmq: (configuration) =>
      createBullMqConnector(configuration, {
        redisUrl: resolveValue(configuration, "redisUrl", environment),
      }),
    loki: (configuration) =>
      createLokiConnector(configuration, {
        endpoint: resolveValue(configuration, "endpoint", environment, "http://127.0.0.1:3100"),
        token: resolveValue(configuration, "token", environment),
      }),
  } satisfies Readonly<Record<string, ConnectorFactory>>

  for (const type of Object.keys(additional)) {
    if (type in builtIns) throw new Error(OperationalText.ConnectorTypeAlreadyRegistered)
  }

  return { ...builtIns, ...additional }
}

function resolveValue(
  configuration: Parameters<ConnectorFactory>[0],
  key: string,
  environment: Readonly<Record<string, string>>,
  fallback = "",
) {
  const envName = configuration.environment?.[key]
  const value = envName ? environment[envName] : undefined

  if (value) return value
  const configured = configuration.options?.[key]

  return typeof configured === "string" ? configured : fallback
}

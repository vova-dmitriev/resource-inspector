import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { ConnectorConfiguration, ResourceConnector, ResourceStatus } from "../model/types.js"

const OperationalText = {
  ContainerNotFound: "Container not found",
  UnsupportedDockerView: "Unsupported Docker view",
  DockerConnectorIsUnavailable: "Docker connector is unavailable",
  InvalidDockerContext: "Invalid Docker context",
  DockerContainerBindingsAreRequired: "Docker container bindings are required",
  UnknownDockerResource: "Unknown Docker resource",
} as const

const DockerPolicy = {
  TimeoutMs: 5_000,
  MaxOutputBytes: 512_000,
  DefaultLogLines: 100,
  MaximumLogLines: 200,
} as const
const execFileAsync = promisify(execFile)

type DockerCommand = (args: readonly string[]) => Promise<string>

type DockerContainer = Readonly<{
  Names: string
  State: string
  Status: string
  Health?: string
}>

export function createDockerConnector(configuration: ConnectorConfiguration, command: DockerCommand = runDocker) {
  const containers = readContainerBindings(configuration)
  const context = configuration.options?.context
  const resources = configuration.resources.map((resource) => ({
    ...resource,
    views: ["status", "logs"],
  }))

  return {
    resources,
    async status(resourceId: string): Promise<ResourceStatus> {
      const name = containerName(containers, resourceId)
      const listing = await command(dockerArgs(context, ["container", "ls", "--all", "--format", "{{json .}}"]))

      const row = listing
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => parseContainer(line))
        .find((container) => container?.Names === name)

      if (!row)
        return {
          state: "unknown",
          checkedAt: new Date().toISOString(),
          detail: OperationalText.ContainerNotFound,
        }
      const exitCode = row.State === "exited" ? Number(row.Status.match(/Exited \((-?\d+)\)/)?.[1]) : undefined

      return {
        state: dockerResourceState(row),
        checkedAt: new Date().toISOString(),
        detail: row.Status,
        ...(exitCode !== undefined && Number.isFinite(exitCode) ? { exitCode } : {}),
      }
    },
    async inspect(resourceId: string, view: string, input: Readonly<Record<string, unknown>> = {}) {
      if (view !== "logs") throw new Error(OperationalText.UnsupportedDockerView)
      const name = containerName(containers, resourceId)
      const requested = Number(input.limit ?? DockerPolicy.DefaultLogLines)

      const limit = Math.max(
        1,
        Math.min(DockerPolicy.MaximumLogLines, Math.floor(Number.isFinite(requested) ? requested : DockerPolicy.DefaultLogLines)),
      )

      const result = await command(dockerArgs(context, ["logs", "--tail", String(limit), name]))

      return {
        lines: result.split(/\r?\n/).filter(Boolean).slice(-DockerPolicy.MaximumLogLines),
      }
    },
  } satisfies ResourceConnector
}

function dockerResourceState(container: DockerContainer): ResourceStatus["state"] {
  if (container.State === "running" && container.Health === "unhealthy") return "degraded"
  if (container.State === "running" && container.Health === "starting") return "starting"
  if (container.State === "running") return "running"
  if (container.State === "created" || container.State === "restarting") return "starting"

  return "stopped"
}

async function runDocker(args: readonly string[]) {
  try {
    const result = await execFileAsync("docker", [...args], {
      timeout: DockerPolicy.TimeoutMs,
      maxBuffer: DockerPolicy.MaxOutputBytes,
    })

    return result.stdout
  } catch {
    throw new Error(OperationalText.DockerConnectorIsUnavailable)
  }
}

function dockerArgs(context: unknown, args: readonly string[]) {
  if (context === undefined) return [...args]
  if (typeof context !== "string" || !/^[a-zA-Z0-9_.-]{1,64}$/.test(context)) throw new Error(OperationalText.InvalidDockerContext)

  return ["--context", context, ...args]
}

function readContainerBindings(configuration: ConnectorConfiguration): Record<string, string> {
  const value = configuration.options?.containers

  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(OperationalText.DockerContainerBindingsAreRequired)

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && /^[a-zA-Z0-9_.-]{1,128}$/.test(entry[1]),
    ),
  )
}

function containerName(bindings: Readonly<Record<string, string>>, resourceId: string) {
  const name = bindings[resourceId]

  if (!name) throw new Error(OperationalText.UnknownDockerResource)

  return name
}

function parseContainer(line: string): DockerContainer | undefined {
  try {
    const value = JSON.parse(line) as Partial<DockerContainer>

    if (typeof value.Names !== "string" || typeof value.State !== "string" || typeof value.Status !== "string") return undefined

    return value as DockerContainer
  } catch {
    return undefined
  }
}

#!/usr/bin/env node
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { loadProfileConfiguration } from "./config/profile-config.js"
import { createProfileSettingsService, validateProfileConnections } from "./config/settings.js"
import { createConnectorFactories } from "./connectors/factories.js"
import { loadConnectorModules } from "./connectors/plugin-loader.js"
import { createProjectCatalog } from "./projects/catalog.js"
import { createProjectRuntime } from "./projects/runtime.js"
import { createInspectorMcpServer } from "./mcp/server.js"
import { createInspectorService } from "./model/inspector.js"
import { createMapViewer } from "./viewer/server.js"
import { createProjectHub } from "./viewer/project-hub.js"
import type { ProfileConfiguration } from "./model/types.js"

const OperationalText = {
  AGeneratedMapPathIsRequiredWithMap: "A generated map path is required with --map",
  LocalViewerFailedToBind: "Local viewer failed to bind",
  UsageResourceInspectorMcpMapHub:
    "Usage: resource-inspector (mcp | map --map <file> | hub) [--config <file>] [--env <file>] [--projects <file>]",
  InvalidInspectorPort: "Invalid inspector port",
} as const

const CliPolicy = {
  DefaultPort: 8_765,
  MinimumPort: 1_024,
  MaximumPort: 65_535,
  ArgumentStartIndex: 2,
  OptionPrefixLength: 2,
} as const
const [command, ...argumentsList] = process.argv.slice(CliPolicy.ArgumentStartIndex)

await main(command, argumentsList)

async function main(commandName: string | undefined, argumentsList: readonly string[]) {
  const options = readOptions(argumentsList)

  if (commandName === "hub") {
    const registryPath = resolve(options.projects ?? join(homedir(), ".resource-inspector", "projects.json"))
    const catalog = createProjectCatalog(registryPath)
    const hub = createProjectHub({ catalog, createRuntime: createProjectRuntime })
    const port = readPort(process.env.INSPECTOR_PORT)

    await new Promise<void>((resolveListen, reject) => {
      hub.once("error", reject)
      hub.listen(port, "127.0.0.1", resolveListen)
    })

    const address = hub.address()

    if (!address || typeof address === "string") throw new Error(OperationalText.LocalViewerFailedToBind)
    process.stdout.write(`Resource Inspector: http://127.0.0.1:${address.port}\n`)

    await new Promise<void>((resolveClose) => {
      process.once("SIGINT", () => hub.close(() => resolveClose()))
      process.once("SIGTERM", () => hub.close(() => resolveClose()))
    })

    return
  }

  const configurationPath = resolve(options.config ?? join(process.cwd(), ".resource-inspector", "profiles.json"))
  const environmentPath = resolve(options.env ?? join(process.cwd(), ".env"))
  const loaded = await loadProfileConfiguration(configurationPath, environmentPath)
  const createFactories = async (environment: Readonly<Record<string, string>>) => {
    const additional = await loadConnectorModules(loaded.connectorModules, environment, dirname(configurationPath))

    return createConnectorFactories(environment, additional)
  }
  let service = createInspectorService({
    profiles: loaded.profiles,
    factories: await createFactories(loaded.environment),
  })

  if (commandName === "mcp") {
    const server = createInspectorMcpServer(service)

    await server.connect(new StdioServerTransport())

    return
  }

  if (commandName === "map") {
    const mapPath = options.map

    if (!mapPath) throw new Error(OperationalText.AGeneratedMapPathIsRequiredWithMap)

    const dynamicService = {
      listProfiles: () => service.listProfiles(),
      listResources: (profileId: string) => service.listResources(profileId),
      getResourceStatus: (profileId: string, resourceId: string) => service.getResourceStatus(profileId, resourceId),
      inspectResource: (profileId: string, resourceId: string, view: string, input?: Readonly<Record<string, unknown>>) =>
        service.inspectResource(profileId, resourceId, view, input),
    }

    const validateConnections = async (
      profile: ProfileConfiguration,
      environment: Readonly<Record<string, string>>,
      changedNames: ReadonlySet<string>,
    ) => {
      const factories = await createFactories(environment)

      return validateProfileConnections(profile, environment, changedNames, factories)
    }
    const updateConfiguration = async (profiles: readonly ProfileConfiguration[], environment: Readonly<Record<string, string>>) => {
      service = createInspectorService({
        profiles,
        factories: await createFactories(environment),
      })
    }
    const settings = createProfileSettingsService(configurationPath, environmentPath, process.env, validateConnections, updateConfiguration)

    const viewer = createMapViewer({
      mapPath: resolve(mapPath),
      service: dynamicService,
      settings,
    })
    const port = readPort(process.env.INSPECTOR_PORT)

    await new Promise<void>((resolveListen, reject) => {
      viewer.once("error", reject)
      viewer.listen(port, "127.0.0.1", resolveListen)
    })

    const address = viewer.address()

    if (!address || typeof address === "string") throw new Error(OperationalText.LocalViewerFailedToBind)
    process.stdout.write(`Resource map: http://127.0.0.1:${address.port}\n`)

    await new Promise<void>((resolveClose) => {
      process.once("SIGINT", () => viewer.close(() => resolveClose()))
      process.once("SIGTERM", () => viewer.close(() => resolveClose()))
    })

    return
  }

  throw new Error(OperationalText.UsageResourceInspectorMcpMapHub)
}

function readOptions(values: readonly string[]) {
  const options: Record<string, string> = {}

  for (let index = 0; index < values.length; index += 1) {
    const key = values[index]

    if (!key?.startsWith("--")) continue
    const value = values[index + 1]

    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`)
    options[key.slice(CliPolicy.OptionPrefixLength)] = value
    index += 1
  }

  return options
}

function readPort(value: string | undefined) {
  if (!value) return CliPolicy.DefaultPort
  const port = Number(value)

  if (!Number.isInteger(port) || port < CliPolicy.MinimumPort || port > CliPolicy.MaximumPort) {
    throw new Error(OperationalText.InvalidInspectorPort)
  }

  return port
}

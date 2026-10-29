import { readFile } from "node:fs/promises"
import { dirname } from "node:path"
import { loadProfileConfiguration } from "../config/profile-config.js"
import { createProfileSettingsService, validateProfileConnections } from "../config/settings.js"
import { createConnectorFactories } from "../connectors/factories.js"
import { loadConnectorModules } from "../connectors/plugin-loader.js"
import { createInspectorService } from "../model/inspector.js"
import { parseMapDocument } from "../viewer/map-access.js"
import type { ViewerService, ViewerSettingsService } from "../viewer/server.js"
import type { ProjectRecord } from "./types.js"

export type ProjectRuntime = Readonly<{
  html: string
  map: ReturnType<typeof parseMapDocument>
  service: ViewerService
  settings: ViewerSettingsService
}>

export async function createProjectRuntime(project: ProjectRecord, processEnvironment: NodeJS.ProcessEnv = process.env) {
  const html = await readFile(project.mapPath, "utf8")
  const map = parseMapDocument(html)
  const loaded = await loadProfileConfiguration(project.configPath, project.envPath, processEnvironment)
  const createFactories = async (environment: Readonly<Record<string, string>>) => {
    const additional = await loadConnectorModules(loaded.connectorModules, environment, dirname(project.configPath))

    return createConnectorFactories(environment, additional)
  }
  let service = createInspectorService({
    profiles: loaded.profiles,
    factories: await createFactories(loaded.environment),
  })
  const dynamicService: ViewerService = {
    listProfiles: () => service.listProfiles(),
    listResources: (profileId) => service.listResources(profileId),
    getResourceStatus: (profileId, resourceId) => service.getResourceStatus(profileId, resourceId),
    inspectResource: (profileId, resourceId, view, input) => service.inspectResource(profileId, resourceId, view, input),
  }
  const settings = createProfileSettingsService(
    project.configPath,
    project.envPath,
    processEnvironment,
    async (profile, environment, changedNames) => {
      const factories = await createFactories(environment)

      await validateProfileConnections(profile, environment, changedNames, factories)
    },
    async (profiles, environment) => {
      service = createInspectorService({
        profiles,
        factories: await createFactories(environment),
      })
    },
  )

  return { html, map, service: dynamicService, settings } satisfies ProjectRuntime
}

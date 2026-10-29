import { readFile } from "node:fs/promises"
import { type IncomingMessage, type ServerResponse, createServer } from "node:http"
import type { ProfileDescriptor, ResourceDescriptor, ResourceStatus } from "../model/types.js"
import { isLocalHost, isValidOrigin, readJsonBody, sendJson } from "./http-utils.js"
import {
  assertBoundResource,
  assertProfile,
  filterSettings,
  isRecord,
  parseMapDocument,
  resourceBindings,
  type MapDocument,
} from "./map-access.js"

const OperationalText = {
  LocalViewerOnly: "Local viewer only",
  InvalidOrigin: "Invalid origin",
  InvalidSettings: "Invalid settings",
  NotFound: "Not found",
  ResourceInspectionFailed: "Resource inspection failed",
  RequiredQueryValueIsMissing: "Required query value is missing",
  GeneratedMapDataIsMissing: "Generated map data is missing",
  GeneratedMapDataIsInvalid: "Generated map data is invalid",
  ProfileIsNotDeclaredByThisMap: "Profile is not declared by this map",
  ResourceIsNotBoundToThisMap: "Resource is not bound to this map",
  RequiredValueIsMissing: "Required value is missing",
} as const

const ViewerPath = {
  Profiles: "/__resource-inspector/profiles",
  Resources: "/__resource-inspector/resources",
  Status: "/__resource-inspector/status",
  Inspect: "/__resource-inspector/inspect",
  Settings: "/__resource-inspector/settings",
  SecretSettings: "/__resource-inspector/settings/secrets",
} as const

export type ViewerService = Readonly<{
  listProfiles(): readonly ProfileDescriptor[]
  listResources(profileId: string): readonly ResourceDescriptor[]
  getResourceStatus(profileId: string, resourceId: string): Promise<ResourceStatus>
  inspectResource(profileId: string, resourceId: string, view: string, input?: Readonly<Record<string, unknown>>): Promise<unknown>
}>

export type ViewerSettingsService = Readonly<{
  list(): Promise<unknown>
  updateSecrets(profileId: string, values: Readonly<Record<string, string>>): Promise<unknown>
}>

export function createMapViewer({
  mapPath,
  service,
  settings,
}: Readonly<{
  mapPath: string
  service: ViewerService
  settings?: ViewerSettingsService
}>) {
  let htmlPromise: Promise<string> | undefined
  let mapPromise: Promise<MapDocument> | undefined
  const readHtml = () => (htmlPromise ??= readFile(mapPath, "utf8"))
  const readMap = () => (mapPromise ??= readHtml().then(parseMapDocument))

  return createServer((request, response) => {
    void handleRequest(request, response, readHtml, readMap, service, settings)
  })
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  readHtml: () => Promise<string>,
  readMap: () => Promise<MapDocument>,
  service: ViewerService,
  settings?: ViewerSettingsService,
) {
  if (!isLocalHost(request.headers.host)) return sendJson(response, 421, { error: OperationalText.LocalViewerOnly })
  if (!isValidOrigin(request.headers.origin, request.headers.host)) return sendJson(response, 403, { error: OperationalText.InvalidOrigin })

  const url = new URL(request.url ?? "/", `http://${request.headers.host}`)

  try {
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const html = await readHtml()

      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      })

      response.end(html)

      return
    }

    const map = await readMap()

    if (request.method === "GET" && url.pathname === ViewerPath.Profiles) {
      const profileIds = new Set((map.resourceProfiles ?? []).map(({ id }) => id))

      return sendJson(response, 200, {
        profiles: service.listProfiles().filter(({ id }) => profileIds.has(id)),
      })
    }

    if (request.method === "GET" && url.pathname === ViewerPath.Resources) {
      const profileId = requiredQuery(url, "profileId")

      assertProfile(map, profileId)
      const allowed = resourceBindings(map, profileId)

      return sendJson(response, 200, {
        resources: service.listResources(profileId).filter(({ id }) => allowed.has(id)),
      })
    }

    if (request.method === "GET" && url.pathname === ViewerPath.Settings && settings) {
      const configured = await settings.list()

      return sendJson(response, 200, filterSettings(configured, map))
    }

    if (request.method === "GET" && url.pathname === ViewerPath.Status) {
      const profileId = requiredQuery(url, "profileId")
      const resourceId = requiredQuery(url, "resourceId")

      assertBoundResource(map, profileId, resourceId)

      return sendJson(response, 200, await service.getResourceStatus(profileId, resourceId))
    }

    if (request.method === "POST" && url.pathname === ViewerPath.Inspect) {
      const input = await readJsonBody(request)
      const profileId = requiredString(input.profileId)
      const resourceId = requiredString(input.resourceId)
      const view = requiredString(input.view)

      assertBoundResource(map, profileId, resourceId)
      const filters = isRecord(input.input) ? input.input : {}

      return sendJson(response, 200, await service.inspectResource(profileId, resourceId, view, filters))
    }

    if (request.method === "POST" && url.pathname === ViewerPath.SecretSettings && settings) {
      const input = await readJsonBody(request)
      const profileId = requiredString(input.profileId)

      if (!isRecord(input.values) || Object.values(input.values).some((value) => typeof value !== "string"))
        throw new Error(OperationalText.InvalidSettings)
      assertProfile(map, profileId)

      return sendJson(response, 200, filterSettings(await settings.updateSecrets(profileId, input.values as Record<string, string>), map))
    }

    return sendJson(response, 404, { error: OperationalText.NotFound })
  } catch {
    return sendJson(response, 400, {
      error: OperationalText.ResourceInspectionFailed,
    })
  }
}

function requiredQuery(url: URL, key: string) {
  const value = url.searchParams.get(key)

  if (!value) throw new Error(OperationalText.RequiredQueryValueIsMissing)

  return value
}

function requiredString(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error(OperationalText.RequiredValueIsMissing)

  return value
}

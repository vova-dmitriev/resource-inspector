import { type IncomingMessage, type ServerResponse, createServer } from "node:http"
import { assertBoundResource, assertProfile, filterSettings, injectInspectorBasePath, isRecord } from "./map-access.js"
import { renderProjectHubPage } from "./project-hub-page.js"
import { isLocalHost, isValidOrigin, readJsonBody, sendJson } from "./http-utils.js"
import type { ProjectRuntime } from "../projects/runtime.js"
import type { ProjectInput, ProjectRecord, ProjectSummary } from "../projects/types.js"

const OperationalText = {
  InvalidOrigin: "Invalid origin",
  InvalidProjectInput: "Invalid project input",
  NotFound: "Not found",
  ProjectHubLocalOnly: "Project hub is local only",
  ProjectInspectionFailed: "Project inspection failed",
  RequiredValueIsMissing: "Required value is missing",
} as const

const HubResponse = {
  HTMLType: "text/html; charset=utf-8",
  NoStore: "no-store",
  Nosniff: "nosniff",
} as const

type ProjectCatalog = Readonly<{
  list(): Promise<readonly ProjectSummary[]>
  add(input: ProjectInput): Promise<ProjectRecord>
  update(id: string, input: ProjectInput): Promise<ProjectRecord>
  remove(id: string): Promise<void>
  resolve(id: string): Promise<ProjectRecord>
}>

export function createProjectHub({
  catalog,
  createRuntime,
}: Readonly<{
  catalog: ProjectCatalog
  createRuntime(project: ProjectRecord): Promise<ProjectRuntime>
}>) {
  const runtimeCache = new Map<string, Promise<ProjectRuntime>>()

  async function runtime(projectId: string) {
    let value = runtimeCache.get(projectId)

    if (!value) {
      value = catalog.resolve(projectId).then(createRuntime)
      runtimeCache.set(projectId, value)
      value.catch(() => runtimeCache.delete(projectId))
    }

    return value
  }

  return createServer((request, response) => {
    void handleRequest(request, response, catalog, runtime, runtimeCache)
  })
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  catalog: ProjectCatalog,
  runtime: (projectId: string) => Promise<ProjectRuntime>,
  runtimeCache: Map<string, Promise<ProjectRuntime>>,
) {
  if (!isLocalHost(request.headers.host)) return sendJson(response, 421, { error: OperationalText.ProjectHubLocalOnly })
  if (!isValidOrigin(request.headers.origin, request.headers.host)) return sendJson(response, 403, { error: OperationalText.InvalidOrigin })

  const url = new URL(request.url ?? "/", `http://${request.headers.host}`)

  try {
    if (request.method === "GET" && url.pathname === "/__resource-inspector/projects") {
      return sendJson(response, 200, { projects: await catalog.list() })
    }

    const projectDetail = url.pathname.match(/^\/__resource-inspector\/projects\/([^/]+)$/)

    if (request.method === "GET" && projectDetail) {
      const project = await catalog.resolve(decodeURIComponent(projectDetail[1] ?? ""))

      return sendJson(response, 200, { project })
    }

    if (request.method === "POST" && url.pathname === "/__resource-inspector/projects") {
      const project = await catalog.add(parseProjectInput(await readJsonBody(request)))

      return sendJson(response, 201, { project: { id: project.id, name: project.name } })
    }

    const projectMutation = url.pathname.match(/^\/__resource-inspector\/projects\/([^/]+)$/)

    if (projectMutation && request.method === "PATCH") {
      const projectId = decodeURIComponent(projectMutation[1] ?? "")
      const project = await catalog.update(projectId, parseProjectInput(await readJsonBody(request)))

      runtimeCache.delete(projectId)

      return sendJson(response, 200, { project: { id: project.id, name: project.name } })
    }

    if (projectMutation && request.method === "DELETE") {
      const projectId = decodeURIComponent(projectMutation[1] ?? "")

      await catalog.remove(projectId)
      runtimeCache.delete(projectId)

      return sendJson(response, 200, { removed: true })
    }

    const projectRoute = url.pathname.match(/^\/projects\/([^/]+)(?:\/(.*))?$/)

    if (projectRoute) {
      const projectId = decodeURIComponent(projectRoute[1] ?? "")
      const projectPath = projectRoute[2] ?? ""
      const selectedRuntime = await runtime(projectId)

      if (request.method === "GET" && projectPath === "")
        return sendHtml(response, injectInspectorBasePath(selectedRuntime.html, `/projects/${encodeURIComponent(projectId)}`))

      if (projectPath.startsWith("__resource-inspector/")) {
        return handleInspectorRequest(request, response, url, projectPath.slice("__resource-inspector/".length), selectedRuntime)
      }
    }

    if (request.method === "GET" && url.pathname === "/") {
      return sendHtml(response, renderProjectHubPage(await catalog.list()))
    }

    return sendJson(response, 404, { error: OperationalText.NotFound })
  } catch {
    return sendJson(response, 400, { error: OperationalText.ProjectInspectionFailed })
  }
}

async function handleInspectorRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  route: string,
  runtime: ProjectRuntime,
) {
  const { service, map, settings } = runtime

  if (request.method === "GET" && route === "profiles") {
    const profileIds = new Set((map.resourceProfiles ?? []).map(({ id }) => id))

    return sendJson(response, 200, { profiles: service.listProfiles().filter(({ id }) => profileIds.has(id)) })
  }

  if (request.method === "GET" && route === "resources") {
    const profileId = requiredQuery(url, "profileId")

    assertProfile(map, profileId)

    return sendJson(response, 200, {
      resources: service.listResources(profileId).filter(({ id }) => resourceBindings(map, profileId).has(id)),
    })
  }

  if (request.method === "GET" && route === "settings") {
    return sendJson(response, 200, filterSettings(await settings.list(), map))
  }

  if (request.method === "GET" && route === "status") {
    const profileId = requiredQuery(url, "profileId")
    const resourceId = requiredQuery(url, "resourceId")

    assertBoundResource(map, profileId, resourceId)

    return sendJson(response, 200, await service.getResourceStatus(profileId, resourceId))
  }

  if (request.method === "POST" && route === "inspect") {
    const body = await readJsonBody(request)
    const profileId = requiredString(body.profileId)
    const resourceId = requiredString(body.resourceId)
    const view = requiredString(body.view)

    assertBoundResource(map, profileId, resourceId)

    return sendJson(response, 200, await service.inspectResource(profileId, resourceId, view, isRecord(body.input) ? body.input : {}))
  }

  if (request.method === "POST" && route === "settings/secrets") {
    const body = await readJsonBody(request)
    const profileId = requiredString(body.profileId)

    assertProfile(map, profileId)

    if (!isRecord(body.values) || Object.values(body.values).some((value) => typeof value !== "string"))
      throw new Error(OperationalText.InvalidProjectInput)

    return sendJson(response, 200, filterSettings(await settings.updateSecrets(profileId, body.values as Record<string, string>), map))
  }

  return sendJson(response, 404, { error: OperationalText.NotFound })
}

function parseProjectInput(value: Record<string, unknown>): ProjectInput {
  const { name, mapPath, configPath, envPath } = value

  if ([name, mapPath, configPath, envPath].some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(OperationalText.InvalidProjectInput)
  }

  return {
    name: name as string,
    mapPath: mapPath as string,
    configPath: configPath as string,
    envPath: envPath as string,
  }
}

function requiredQuery(url: URL, key: string) {
  const value = url.searchParams.get(key)

  if (!value) throw new Error(OperationalText.RequiredValueIsMissing)

  return value
}

function requiredString(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error(OperationalText.RequiredValueIsMissing)

  return value
}

function sendHtml(response: ServerResponse, html: string) {
  response.writeHead(200, {
    "content-type": HubResponse.HTMLType,
    "cache-control": HubResponse.NoStore,
    "x-content-type-options": HubResponse.Nosniff,
  })
  response.end(html)
}

function resourceBindings(map: ProjectRuntime["map"], profileId: string) {
  return new Set(
    (map.tabs ?? []).flatMap((tab) =>
      (tab.diagrams ?? []).flatMap((diagram) => (diagram.nodes ?? []).flatMap((node) => node.resourceRefsByProfile?.[profileId] ?? [])),
    ),
  )
}

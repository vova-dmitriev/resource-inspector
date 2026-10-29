import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { loadProfileConfiguration } from "../config/profile-config.js"
import { assertProfile, parseMapDocument, resourceBindings } from "../viewer/map-access.js"
import { parseProjectRecord, readProjectRegistry, writeProjectRegistry } from "./registry.js"
import type { ProjectInput, ProjectRecord, ProjectSummary } from "./types.js"

const OperationalText = {
  ProjectMapProfileIsNotConfigured: "Project map profile is not configured",
  ProjectResourceIsNotConfigured: "Project resource is not configured for the selected profile",
  UnableToValidateProject: "Unable to validate project",
  UnknownProject: "Unknown project",
} as const

export type ProjectValidator = (project: ProjectRecord) => Promise<void>

export function createProjectCatalog(registryPath: string, validateProject: ProjectValidator = validateProjectFiles) {
  let pendingWrite = Promise.resolve()

  async function list(): Promise<readonly ProjectSummary[]> {
    const registry = await readProjectRegistry(registryPath)

    return registry.projects.map(({ id, name }) => ({ id, name }))
  }

  async function add(input: ProjectInput) {
    const project = parseProjectRecord({ id: randomUUID(), ...input })

    await validateProject(project)

    return serialize(async () => {
      const registry = await readProjectRegistry(registryPath)

      await writeProjectRegistry(registryPath, { projects: [...registry.projects, project] })

      return project
    })
  }

  async function update(id: string, input: ProjectInput) {
    const project = parseProjectRecord({ id, ...input })

    await validateProject(project)

    return serialize(async () => {
      const registry = await readProjectRegistry(registryPath)

      if (!registry.projects.some((item) => item.id === id)) throw new Error(OperationalText.UnknownProject)

      await writeProjectRegistry(registryPath, {
        projects: registry.projects.map((item) => (item.id === id ? project : item)),
      })

      return project
    })
  }

  async function remove(id: string) {
    return serialize(async () => {
      const registry = await readProjectRegistry(registryPath)
      const projects = registry.projects.filter((project) => project.id !== id)

      if (projects.length === registry.projects.length) throw new Error(OperationalText.UnknownProject)

      await writeProjectRegistry(registryPath, { projects })
    })
  }

  async function resolve(id: string) {
    const registry = await readProjectRegistry(registryPath)
    const project = registry.projects.find((item) => item.id === id)

    if (!project) throw new Error(OperationalText.UnknownProject)

    return project
  }

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pendingWrite.then(operation)

    pendingWrite = result.then(
      () => undefined,
      () => undefined,
    )

    return result
  }

  return { list, add, update, remove, resolve }
}

async function validateProjectFiles(project: ProjectRecord) {
  let map: ReturnType<typeof parseMapDocument>
  let profiles: readonly Readonly<{ id: string; connectors: readonly Readonly<{ resources: readonly Readonly<{ id: string }>[] }>[] }>[]

  try {
    map = parseMapDocument(await readFile(project.mapPath, "utf8"))
    const configuration = await loadProfileConfiguration(project.configPath, project.envPath, {})

    profiles = configuration.profiles
  } catch {
    throw new Error(OperationalText.UnableToValidateProject)
  }

  const profileIds = new Set(profiles.map(({ id }) => id))
  const configuredResources = new Map(
    profiles.map(({ id, connectors }) => [
      id,
      new Set(connectors.flatMap(({ resources }) => resources.map(({ id: resourceId }) => resourceId))),
    ]),
  )

  for (const profile of map.resourceProfiles ?? []) {
    if (!profileIds.has(profile.id)) throw new Error(OperationalText.ProjectMapProfileIsNotConfigured)

    assertProfile(map, profile.id)
    const resources = configuredResources.get(profile.id) ?? new Set<string>()

    for (const resourceId of resourceBindings(map, profile.id)) {
      if (!resources.has(resourceId)) throw new Error(OperationalText.ProjectResourceIsNotConfigured)
    }
  }
}

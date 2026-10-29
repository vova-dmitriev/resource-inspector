import type {
  ConnectorConfiguration,
  InspectorConfiguration,
  ProfileDescriptor,
  ResourceConnector,
  ResourceDescriptor,
  ResourceStatus,
} from "./types.js"

const InspectorError = {
  UnknownProfile: "Unknown profile",
  UnknownResource: "Unknown resource",
  StatusUnsupported: "Resource status is unsupported",
  UnknownConnector: "Unknown connector type",
  DuplicateProfile: "Duplicate profile ID",
  DuplicateResource: "Duplicate resource ID in profile",
} as const

type BoundConnector = Readonly<{
  configuration: ConnectorConfiguration
  connector: ResourceConnector
}>

export function createInspectorService(configuration: InspectorConfiguration) {
  const profiles = new Map(configuration.profiles.map((profile) => [profile.id, profile]))

  if (profiles.size !== configuration.profiles.length) throw new Error(InspectorError.DuplicateProfile)

  const connectors = new Map(
    configuration.profiles.map((profile) => [
      profile.id,
      profile.connectors.map((item) => {
        const factory = configuration.factories[item.type]

        if (!factory) throw new Error(`${InspectorError.UnknownConnector}: ${item.type}`)

        return {
          configuration: item,
          connector: factory(item),
        } satisfies BoundConnector
      }),
    ]),
  )

  for (const profile of configuration.profiles) {
    const ids = connectors.get(profile.id)?.flatMap(({ connector }) => connector.resources.map(({ id }) => id)) ?? []

    if (new Set(ids).size !== ids.length) throw new Error(InspectorError.DuplicateResource)
  }

  function profileConnectors(profileId: string) {
    const result = connectors.get(profileId)

    if (!result) throw new Error(InspectorError.UnknownProfile)

    return result
  }

  return {
    listProfiles(): readonly ProfileDescriptor[] {
      return configuration.profiles.map(({ id, name, kind }) => ({
        id,
        name,
        kind,
      }))
    },
    listResources(profileId: string): readonly ResourceDescriptor[] {
      return profileConnectors(profileId).flatMap(({ connector }) => connector.resources)
    },
    async inspectResource(profileId: string, resourceId: string, view: string, input: Readonly<Record<string, unknown>> = {}) {
      for (const { connector } of profileConnectors(profileId)) {
        if (connector.resources.some(({ id }) => id === resourceId)) return connector.inspect(resourceId, view, input)
      }

      throw new Error(InspectorError.UnknownResource)
    },
    async getResourceStatus(profileId: string, resourceId: string): Promise<ResourceStatus> {
      for (const { connector } of profileConnectors(profileId)) {
        if (!connector.resources.some(({ id }) => id === resourceId)) continue
        if (!connector.status) throw new Error(InspectorError.StatusUnsupported)

        return connector.status(resourceId)
      }

      throw new Error(InspectorError.UnknownResource)
    },
  }
}

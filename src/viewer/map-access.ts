const MapDataPolicy = { ScriptId: "map-data" } as const
const OperationalText = {
  GeneratedMapDataIsMissing: "Generated map data is missing",
  GeneratedMapDataIsInvalid: "Generated map data is invalid",
  ProfileIsNotDeclaredByThisMap: "Profile is not declared by this map",
  ResourceIsNotBoundToThisMap: "Resource is not bound to this map",
} as const

export type MapDocument = Readonly<{
  resourceProfiles?: readonly Readonly<{ id: string }>[]
  tabs?: readonly Readonly<{
    diagrams?: readonly Readonly<{
      nodes?: readonly Readonly<{
        resourceRefsByProfile?: Readonly<Record<string, readonly string[]>>
      }>[]
    }>[]
  }>[]
}>

export function parseMapDocument(html: string): MapDocument {
  const manifest = html.match(new RegExp(`<script\\b[^>]*\\bid=["']${MapDataPolicy.ScriptId}["'][^>]*>([\\s\\S]*?)<\\/script>`, "i"))?.[1]

  if (!manifest) throw new Error(OperationalText.GeneratedMapDataIsMissing)
  const value: unknown = JSON.parse(manifest)

  if (!isRecord(value) || !Array.isArray(value.tabs)) throw new Error(OperationalText.GeneratedMapDataIsInvalid)

  return value as MapDocument
}

export function assertProfile(map: MapDocument, profileId: string) {
  if (!(map.resourceProfiles ?? []).some(({ id }) => id === profileId)) throw new Error(OperationalText.ProfileIsNotDeclaredByThisMap)
}

export function assertBoundResource(map: MapDocument, profileId: string, resourceId: string) {
  assertProfile(map, profileId)

  if (!resourceBindings(map, profileId).has(resourceId)) throw new Error(OperationalText.ResourceIsNotBoundToThisMap)
}

export function resourceBindings(map: MapDocument, profileId: string) {
  return new Set(
    (map.tabs ?? []).flatMap((tab) =>
      (tab.diagrams ?? []).flatMap((diagram) => (diagram.nodes ?? []).flatMap((node) => node.resourceRefsByProfile?.[profileId] ?? [])),
    ),
  )
}

export function filterSettings(value: unknown, map: MapDocument) {
  if (!isRecord(value) || !Array.isArray(value.profiles)) return { profiles: [] }
  const profileIds = new Set((map.resourceProfiles ?? []).map(({ id }) => id))

  return {
    ...value,
    profiles: value.profiles.filter((profile) => isRecord(profile) && typeof profile.id === "string" && profileIds.has(profile.id)),
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

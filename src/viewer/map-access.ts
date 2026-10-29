const MapDataPolicy = { ScriptId: "map-data" } as const
const OperationalText = {
  GeneratedMapDataIsMissing: "Generated map data is missing",
  GeneratedMapDataIsInvalid: "Generated map data is invalid",
  GeneratedMapHeadIsMissing: "Generated map head is missing",
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

export function injectInspectorBasePath(html: string, basePath: string) {
  if (!/^\/projects\/[a-zA-Z0-9_.-]{1,96}$/.test(basePath)) throw new Error(OperationalText.GeneratedMapDataIsInvalid)
  const head = /<head\b[^>]*>/i.exec(html)

  if (!head || head.index === undefined) throw new Error(OperationalText.GeneratedMapHeadIsMissing)

  const metadata = [
    `<meta name="resource-inspector-base-path" content="${escapeAttribute(basePath)}">`,
    '<meta name="resource-inspector-hub-url" content="/">',
  ].join("")
  const cleanHtml = html.replace(/<meta\s+name=["']resource-inspector-(?:base-path|hub-url)["'][^>]*>/gi, "")
  const cleanHead = /<head\b[^>]*>/i.exec(cleanHtml)

  if (!cleanHead || cleanHead.index === undefined) throw new Error(OperationalText.GeneratedMapHeadIsMissing)

  const insertionPoint = cleanHead.index + cleanHead[0].length

  return `${cleanHtml.slice(0, insertionPoint)}${metadata}${cleanHtml.slice(insertionPoint)}`
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

function escapeAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

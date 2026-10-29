import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createMapViewer } from "../server.js"

const OperationalText = {
  ViewerDidNotBind: "Viewer did not bind",
} as const

const cleanups: Array<() => Promise<void>> = []

const mapHtml =
  '<h1>Map</h1><script type="application/json" id="map-data">{"resourceProfiles":[{"id":"local","name":"Local","kind":"local"}],"tabs":[{"diagrams":[{"nodes":[{"id":"api","resourceRefsByProfile":{"local":["api"]}}]}]}]}</script>'

const cloudMapHtml =
  '<script type="application/json" id="map-data">{"resourceProfiles":[{"id":"cloud","name":"Cloud","kind":"cloud"}],"tabs":[]}</script>'

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})

describe("createMapViewer", () => {
  it("serves only the selected map and allows same-origin profile-scoped inspection", async () => {
    const root = await mkdtemp(join(tmpdir(), "resource-map-"))

    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const mapPath = join(root, "map.html")

    await writeFile(mapPath, mapHtml)

    const service = {
      listProfiles: () => [{ id: "local", name: "Local", kind: "local" as const }],
      listResources: () => [{ id: "api", name: "API" }],
      getResourceStatus: async () => ({
        state: "running" as const,
        checkedAt: "now",
      }),
      inspectResource: async (_profileId: string, resourceId: string, view: string) => ({ resourceId, view }),
    }

    const server = createMapViewer({ mapPath, service })

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()

    if (!address || typeof address === "string") throw new Error(OperationalText.ViewerDidNotBind)
    const origin = `http://127.0.0.1:${address.port}`

    await expect(fetch(origin).then((response) => response.text())).resolves.toContain("<h1>Map</h1>")

    await expect(
      fetch(`${origin}/__resource-inspector/inspect`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({
          profileId: "local",
          resourceId: "api",
          view: "logs",
        }),
      }).then((response) => response.json()),
    ).resolves.toEqual({ resourceId: "api", view: "logs" })

    await expect(fetch(`${origin}/other.html`).then((response) => response.status)).resolves.toBe(404)

    await expect(
      fetch(`${origin}/__resource-inspector/status?profileId=local&resourceId=unbound`).then((response) => response.status),
    ).resolves.toBe(400)

    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  })

  it("rejects foreign origins and hosts", async () => {
    const root = await mkdtemp(join(tmpdir(), "resource-map-"))

    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const mapPath = join(root, "map.html")

    await writeFile(mapPath, mapHtml)

    const server = createMapViewer({
      mapPath,
      service: {
        listProfiles: () => [],
        listResources: () => [],
        getResourceStatus: async () => ({ state: "unknown", checkedAt: "now" }),
        inspectResource: async () => ({}),
      },
    })

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()

    if (!address || typeof address === "string") throw new Error(OperationalText.ViewerDidNotBind)

    await expect(
      fetch(`http://127.0.0.1:${address.port}/__resource-inspector/profiles`, {
        headers: { origin: "https://example.test" },
      }).then((response) => response.status),
    ).resolves.toBe(403)

    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  })

  it("exposes connection edit state without returning secret values", async () => {
    const root = await mkdtemp(join(tmpdir(), "resource-map-"))

    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const mapPath = join(root, "map.html")

    await writeFile(mapPath, cloudMapHtml)

    const settings = {
      list: async () => ({
        profiles: [
          {
            id: "cloud",
            connectors: [
              {
                id: "db",
                settings: [{ key: "connectionString", configured: true }],
              },
            ],
          },
        ],
      }),
      updateSecrets: async () => ({ saved: true }),
    }

    const server = createMapViewer({
      mapPath,
      settings,
      service: {
        listProfiles: () => [],
        listResources: () => [],
        getResourceStatus: async () => ({ state: "unknown", checkedAt: "now" }),
        inspectResource: async () => ({}),
      },
    })

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()

    if (!address || typeof address === "string") throw new Error(OperationalText.ViewerDidNotBind)
    const origin = `http://127.0.0.1:${address.port}`

    await expect(fetch(`${origin}/__resource-inspector/settings`).then((response) => response.json())).resolves.toEqual({
      profiles: [
        {
          id: "cloud",
          connectors: [
            {
              id: "db",
              settings: [{ key: "connectionString", configured: true }],
            },
          ],
        },
      ],
    })

    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  })
})

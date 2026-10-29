import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createProjectRuntime } from "../runtime.js"

const roots: string[] = []
const healthUrl = "http://127.0.0.1:4100/health"
const projectMap =
  '<script type="application/json" id="map-data">{"resourceProfiles":[{"id":"local"}],"tabs":[{"diagrams":[{"nodes":[{"resourceRefsByProfile":{"local":["api"]}}]}]}]}</script>'

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("createProjectRuntime", () => {
  it("loads each project's map, .env defaults, resource service, and secret-safe settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "resource-runtime-"))

    roots.push(root)
    const mapPath = join(root, "map.html")
    const configPath = join(root, ".resource-inspector", "profiles.json")
    const envPath = join(root, ".env")

    await writeFile(mapPath, projectMap)
    await import("node:fs/promises").then(({ mkdir }) => mkdir(join(root, ".resource-inspector")))
    await writeFile(
      configPath,
      JSON.stringify({
        profiles: [
          {
            id: "local",
            name: "Local",
            kind: "local",
            connectors: [
              {
                id: "api-health",
                type: "http-health",
                resources: [{ id: "api", name: "API" }],
                options: { targets: { api: "http://127.0.0.1:4000/health" } },
                environment: { api: "API_HEALTH_URL" },
              },
            ],
          },
        ],
      }),
    )
    await writeFile(envPath, `API_HEALTH_URL=${healthUrl}\n`)

    const runtime = await createProjectRuntime({ id: "tickets", name: "Tickets", mapPath, configPath, envPath }, {})
    const settings = await runtime.settings.list()

    expect(runtime.html).toBe(projectMap)
    expect(runtime.map.resourceProfiles).toEqual([{ id: "local" }])
    expect(runtime.service.listResources("local")).toEqual([{ id: "api", name: "API", views: ["status"] }])
    expect(JSON.stringify(settings)).not.toContain(healthUrl)
    expect(settings).toMatchObject({
      profiles: [{ id: "local", connectors: [{ settings: [{ variable: "API_HEALTH_URL", configured: true }] }] }],
    })
  })
})

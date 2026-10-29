import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createProjectCatalog } from "../catalog.js"

const roots: string[] = []

const mapHtml =
  '<script type="application/json" id="map-data">{"resourceProfiles":[{"id":"local"}],"tabs":[{"diagrams":[{"nodes":[{"id":"api","resourceRefsByProfile":{"local":["api-process"]}}]}]}]}</script>'

const profileJson = JSON.stringify({
  profiles: [
    {
      id: "local",
      name: "Local",
      kind: "local",
      connectors: [
        {
          id: "health",
          type: "http-health",
          resources: [{ id: "api-process", name: "API" }],
          options: { targets: { "api-process": "http://127.0.0.1:4000/health" } },
        },
      ],
    },
  ],
})

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("project catalog", () => {
  it("adds a validated project and exposes only its name in the list", async () => {
    const projectRoot = await createProjectRoot()
    const catalog = createProjectCatalog(join(projectRoot, "registry.json"))
    const input = await createProjectFiles(projectRoot)
    const added = await catalog.add({ name: "Tickets", ...input })

    expect(added).toMatchObject({ name: "Tickets", mapPath: input.mapPath })
    expect(added.id).toMatch(/^[a-f0-9-]{36}$/)
    await expect(catalog.list()).resolves.toEqual([{ id: added.id, name: "Tickets" }])
    expect(JSON.parse(await readFile(join(projectRoot, "registry.json"), "utf8")).projects).toHaveLength(1)
  })

  it("rejects missing project files without registering the project", async () => {
    const root = await createProjectRoot()
    const catalog = createProjectCatalog(join(root, "registry.json"))

    await expect(
      catalog.add({
        name: "Missing",
        mapPath: join(root, "missing.html"),
        configPath: join(root, "missing-profiles.json"),
        envPath: join(root, "missing.env"),
      }),
    ).rejects.toThrow("Unable to validate project")
    await expect(catalog.list()).resolves.toEqual([])
  })

  it("rejects a map binding that is absent from the selected profile", async () => {
    const root = await createProjectRoot()
    const input = await createProjectFiles(root)
    const catalog = createProjectCatalog(join(root, "registry.json"))

    await writeFile(input.mapPath, mapHtml.replace("api-process", "missing-resource"))

    await expect(catalog.add({ name: "Tickets", ...input })).rejects.toThrow("Project resource is not configured for the selected profile")
    await expect(catalog.list()).resolves.toEqual([])
  })

  it("updates and removes registry entries without touching connected project files", async () => {
    const root = await createProjectRoot()
    const catalog = createProjectCatalog(join(root, "registry.json"))
    const input = await createProjectFiles(root)
    const added = await catalog.add({ name: "Tickets", ...input })
    const updated = await catalog.update(added.id, { name: "Tickets staging", ...input })

    expect(updated.name).toBe("Tickets staging")
    await catalog.remove(added.id)

    await expect(catalog.list()).resolves.toEqual([])
    await expect(readFile(input.mapPath, "utf8")).resolves.toBe(mapHtml)
    await expect(readFile(input.configPath, "utf8")).resolves.toBe(profileJson)
  })
})

async function createProjectRoot() {
  const root = await mkdtemp(join(tmpdir(), "resource-catalog-"))

  roots.push(root)

  return root
}

async function createProjectFiles(root: string) {
  const mapPath = join(root, "architecture-map.html")
  const configPath = join(root, "profiles.json")
  const envPath = join(root, ".env")

  await writeFile(mapPath, mapHtml)
  await writeFile(configPath, profileJson)
  await writeFile(envPath, "")

  return { mapPath, configPath, envPath }
}

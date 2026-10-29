import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { readProjectRegistry, writeProjectRegistry } from "../registry.js"

const roots: string[] = []
const PermissionPolicy = {
  Mask: 0o777,
  Directory: 0o700,
  File: 0o600,
} as const

const sampleProject = {
  id: "tickets",
  name: "Tickets",
  mapPath: "/work/tickets/map.html",
  configPath: "/work/tickets/.resource-inspector/profiles.json",
  envPath: "/work/tickets/.env",
} as const

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("project registry", () => {
  it("returns an empty registry when the registry has not been created", async () => {
    const root = await createRoot()

    await expect(readProjectRegistry(join(root, "projects.json"))).resolves.toEqual({ projects: [] })
  })

  it("writes validated records atomically with owner-only permissions", async () => {
    const root = await createRoot()
    const path = join(root, ".resource-inspector", "projects.json")

    await writeProjectRegistry(path, { projects: [sampleProject] })

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ projects: [sampleProject] })
    expect((await stat(join(root, ".resource-inspector"))).mode & PermissionPolicy.Mask).toBe(PermissionPolicy.Directory)
    expect((await stat(path)).mode & PermissionPolicy.Mask).toBe(PermissionPolicy.File)
  })

  it("rejects duplicate project IDs rather than persisting an ambiguous registry", async () => {
    const root = await createRoot()
    const path = join(root, "projects.json")

    await expect(writeProjectRegistry(path, { projects: [sampleProject, { ...sampleProject, name: "Other" }] })).rejects.toThrow(
      "Duplicate project ID",
    )
    await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("rejects records with non-absolute paths when reading a hand-edited registry", async () => {
    const root = await createRoot()
    const path = join(root, "projects.json")

    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(path, JSON.stringify({ projects: [{ ...sampleProject, mapPath: "map.html" }] })),
    )

    await expect(readProjectRegistry(path)).rejects.toThrow("Invalid project registry")
  })
})

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "resource-registry-"))

  roots.push(root)

  return root
}

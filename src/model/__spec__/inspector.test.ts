import { describe, expect, it } from "vitest"
import { parseEnvironmentFile } from "../../config/environment.js"
import { createInspectorService } from "../inspector.js"

const OperationalText = {
  UnknownResource: "Unknown resource",
} as const

describe("parseEnvironmentFile", () => {
  it("parses exported and quoted values without mutating the source", () => {
    const contents = "# local\nexport DATABASE_URL='postgresql://localhost/tickets'\nTOKEN=abc # ignored"

    expect(parseEnvironmentFile(contents)).toEqual({
      DATABASE_URL: "postgresql://localhost/tickets",
      TOKEN: "abc",
    })

    expect(contents).toContain("DATABASE_URL='postgresql://localhost/tickets'")
  })
})

describe("createInspectorService", () => {
  it("lists and inspects resources only in the explicitly selected profile", async () => {
    const service = createInspectorService({
      profiles: [
        {
          id: "local",
          name: "Local",
          kind: "local",
          connectors: [
            {
              id: "db-local",
              type: "fixture",
              resources: [{ id: "database", name: "Database" }],
            },
          ],
        },
        {
          id: "cloud-stage",
          name: "Staging",
          kind: "cloud",
          connectors: [
            {
              id: "db-stage",
              type: "fixture",
              resources: [{ id: "database", name: "Database" }],
            },
          ],
        },
      ],
      factories: {
        fixture: (config) => ({
          resources: config.resources,
          inspect: async (resourceId, view) => ({
            resourceId,
            view,
            rows: [{ environment: config.id }],
          }),
        }),
      },
    })

    expect(service.listProfiles()).toEqual([
      { id: "local", name: "Local", kind: "local" },
      { id: "cloud-stage", name: "Staging", kind: "cloud" },
    ])

    expect(service.listResources("local")).toEqual([{ id: "database", name: "Database" }])

    await expect(service.inspectResource("cloud-stage", "database", "preview")).resolves.toEqual({
      resourceId: "database",
      view: "preview",
      rows: [{ environment: "db-stage" }],
    })

    await expect(service.inspectResource("local", "not-declared", "preview")).rejects.toThrow(OperationalText.UnknownResource)
  })

  it("supports a newly registered connector factory without changing inspection handlers", async () => {
    const service = createInspectorService({
      profiles: [
        {
          id: "cloud",
          name: "Cloud",
          kind: "cloud",
          connectors: [
            {
              id: "metrics",
              type: "custom",
              resources: [{ id: "logs", name: "Logs" }],
            },
          ],
        },
      ],
      factories: {
        custom: () => ({
          resources: [{ id: "logs", name: "Logs" }],
          inspect: async () => ({ lines: ["ready"] }),
        }),
      },
    })

    await expect(service.inspectResource("cloud", "logs", "recent")).resolves.toEqual({ lines: ["ready"] })
  })

  it("reports live status through the resource's profile-scoped connector", async () => {
    const service = createInspectorService({
      profiles: [
        {
          id: "local",
          name: "Local",
          kind: "local",
          connectors: [
            {
              id: "web",
              type: "health",
              resources: [{ id: "frontend", name: "Frontend" }],
            },
          ],
        },
      ],
      factories: {
        health: () => ({
          resources: [{ id: "frontend", name: "Frontend" }],
          status: async () => ({
            state: "running",
            checkedAt: "2026-10-29T00:00:00.000Z",
          }),
          inspect: async () => ({}),
        }),
      },
    })

    await expect(service.getResourceStatus("local", "frontend")).resolves.toEqual({
      state: "running",
      checkedAt: "2026-10-29T00:00:00.000Z",
    })
  })
})

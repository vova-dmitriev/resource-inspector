import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { describe, expect, it } from "vitest"
import { createInspectorService } from "../../model/inspector.js"
import { createInspectorMcpServer } from "../server.js"

describe("createInspectorMcpServer", () => {
  it("exposes profile, resource, status, and read-only inspection tools", async () => {
    const service = createInspectorService({
      profiles: [
        {
          id: "local",
          name: "Local",
          kind: "local",
          connectors: [
            {
              id: "service",
              type: "fixture",
              resources: [{ id: "api", name: "API", views: ["logs"] }],
            },
          ],
        },
      ],
      factories: {
        fixture: () => ({
          resources: [{ id: "api", name: "API", views: ["logs"] }],
          status: async () => ({ state: "running", checkedAt: "now" }),
          inspect: async () => ({ lines: ["ready"] }),
        }),
      },
    })

    const server = createInspectorMcpServer(service)
    const client = new Client({ name: "test-client", version: "1.0.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

    const listed = await client.listTools()

    expect(listed.tools.map(({ name }) => name)).toEqual([
      "list_profiles",
      "list_resources",
      "resource_status",
      "inspect_resource",
      "ask_services",
    ])

    await expect(
      client.callTool({
        name: "list_resources",
        arguments: { profileId: "local" },
      }),
    ).resolves.toMatchObject({
      structuredContent: { resources: [{ id: "api" }] },
    })

    await expect(
      client.callTool({
        name: "inspect_resource",
        arguments: { profileId: "local", resourceId: "api", view: "logs" },
      }),
    ).resolves.toMatchObject({
      structuredContent: { lines: ["ready"] },
    })

    await expect(
      client.callTool({
        name: "ask_services",
        arguments: { profileId: "local", question: "Is the API healthy?" },
      }),
    ).resolves.toMatchObject({
      structuredContent: {
        question: "Is the API healthy?",
        evidence: [
          { resources: [{ status: { ok: true, value: { state: "running" } }, inspections: [{ view: "logs", result: { ok: true } }] }] },
        ],
      },
    })

    await Promise.all([client.close(), server.close()])
  })

  it("exposes a project directory and collects evidence for one project", async () => {
    const projectService = {
      listProfiles: () => [{ id: "cloud", name: "Staging", kind: "cloud" as const }],
      listResources: () => [{ id: "api", name: "API", views: ["status", "logs", "rows", "jobs"] }],
      getResourceStatus: async () => ({ state: "running" as const, checkedAt: "now" }),
      inspectResource: async (_profileId: string, _resourceId: string, view: string) => ({ view }),
    }
    const server = createInspectorMcpServer(undefined, {
      list: async () => [{ id: "tickets", name: "Tickets" }],
      resolve: async (id) => {
        if (id !== "tickets") throw new Error("Unknown project")

        return { id, name: "Tickets" }
      },
      service: async () => projectService,
    })
    const client = new Client({ name: "test-client", version: "1.0.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

    await expect(client.listTools()).resolves.toMatchObject({ tools: [{ name: "list_projects" }, { name: "ask_project" }] })
    await expect(client.callTool({ name: "list_projects", arguments: {} })).resolves.toMatchObject({
      structuredContent: { projects: [{ id: "tickets", name: "Tickets" }] },
    })
    await expect(
      client.callTool({ name: "ask_project", arguments: { projectId: "tickets", profileId: "cloud", question: "What is running?" } }),
    ).resolves.toMatchObject({
      structuredContent: {
        project: { id: "tickets", name: "Tickets" },
        evidence: [{ profile: { id: "cloud" }, resources: [{ inspections: [{ view: "logs" }] }] }],
      },
    })
    await expect(
      client.callTool({ name: "ask_project", arguments: { projectId: "missing", profileId: "cloud", question: "What is running?" } }),
    ).resolves.toMatchObject({ isError: true })

    await Promise.all([client.close(), server.close()])
  })
})

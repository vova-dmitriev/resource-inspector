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

    expect(listed.tools.map(({ name }) => name)).toEqual(["list_profiles", "list_resources", "resource_status", "inspect_resource"])

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

    await Promise.all([client.close(), server.close()])
  })
})

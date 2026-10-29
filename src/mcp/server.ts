import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { ProfileDescriptor, ResourceDescriptor, ResourceStatus } from "../model/types.js"

const OperationalText = {
  ListConfiguredLocalAndCloudResourceProfiles: "List configured local and cloud resource profiles",
  ListResourcesInOneExplicitProfile: "List resources in one explicit profile",
  ReadTheCurrentHealthStatusForAConfigured: "Read the current health status for a configured resource",
  InspectAnAllowlistedReadOnlyViewOfA: "Inspect an allowlisted read-only view of a configured resource",
  ResourceInspectionFailed: "Resource inspection failed",
} as const

type InspectorService = Readonly<{
  listProfiles(): readonly ProfileDescriptor[]
  listResources(profileId: string): readonly ResourceDescriptor[]
  inspectResource(profileId: string, resourceId: string, view: string, input?: Readonly<Record<string, unknown>>): Promise<unknown>
  getResourceStatus(profileId: string, resourceId: string): Promise<ResourceStatus>
}>

export function createInspectorMcpServer(service: InspectorService) {
  const server = new McpServer({
    name: "resource-inspector",
    version: "1.0.0",
  })

  server.registerTool(
    "list_profiles",
    {
      description: OperationalText.ListConfiguredLocalAndCloudResourceProfiles,
    },
    async () => success({ profiles: service.listProfiles() }),
  )

  server.registerTool(
    "list_resources",
    {
      description: OperationalText.ListResourcesInOneExplicitProfile,
      inputSchema: { profileId: z.string().min(1) },
    },
    async ({ profileId }) => safeCall(() => ({ resources: service.listResources(profileId) })),
  )

  server.registerTool(
    "resource_status",
    {
      description: OperationalText.ReadTheCurrentHealthStatusForAConfigured,
      inputSchema: {
        profileId: z.string().min(1),
        resourceId: z.string().min(1),
      },
    },
    async ({ profileId, resourceId }) => safeCall(() => service.getResourceStatus(profileId, resourceId)),
  )

  server.registerTool(
    "inspect_resource",
    {
      description: OperationalText.InspectAnAllowlistedReadOnlyViewOfA,
      inputSchema: {
        profileId: z.string().min(1),
        resourceId: z.string().min(1),
        view: z.string().min(1),
        input: z.record(z.unknown()).optional(),
      },
    },
    async ({ profileId, resourceId, view, input }) => safeCall(() => service.inspectResource(profileId, resourceId, view, input)),
  )

  return server
}

async function safeCall(operation: () => unknown | Promise<unknown>) {
  try {
    return success(await operation())
  } catch {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: OperationalText.ResourceInspectionFailed,
        },
      ],
    }
  }
}

function success(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : { result: value }

  return {
    content: [{ type: "text" as const, text: JSON.stringify(record) }],
    structuredContent: record,
  }
}

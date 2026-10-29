import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { ProfileDescriptor, ResourceDescriptor, ResourceStatus } from "../model/types.js"

const OperationalText = {
  ListConfiguredLocalAndCloudResourceProfiles: "List configured local and cloud resource profiles",
  ListResourcesInOneExplicitProfile: "List resources in one explicit profile",
  ReadTheCurrentHealthStatusForAConfigured: "Read the current health status for a configured resource",
  InspectAnAllowlistedReadOnlyViewOfA: "Inspect an allowlisted read-only view of a configured resource",
  SelectedProfileIsNotConfigured: "Selected profile is not configured",
  ResourceInspectionFailed: "Resource inspection failed",
} as const

type InspectorService = Readonly<{
  listProfiles(): readonly ProfileDescriptor[]
  listResources(profileId: string): readonly ResourceDescriptor[]
  inspectResource(profileId: string, resourceId: string, view: string, input?: Readonly<Record<string, unknown>>): Promise<unknown>
  getResourceStatus(profileId: string, resourceId: string): Promise<ResourceStatus>
}>

type ProjectDirectory = Readonly<{
  list(): Promise<readonly Readonly<{ id: string; name: string }>[]>
  resolve(id: string): Promise<Readonly<{ id: string; name: string }>>
  service(id: string): Promise<InspectorService>
}>

const EvidencePolicy = {
  MaximumResources: 30,
  MaximumViewsPerResource: 4,
  LogLimit: 20,
  LogMinutes: 15,
} as const

export function createInspectorMcpServer(service?: InspectorService, projects?: ProjectDirectory) {
  const server = new McpServer({
    name: "resource-inspector",
    version: "1.0.0",
  })

  if (service) {
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

    server.registerTool(
      "ask_services",
      {
        description:
          "Collect recent, bounded, read-only evidence for a question about services in the explicitly selected local or cloud profile. Use this evidence to answer; this tool does not execute commands or queries from the question.",
        inputSchema: {
          question: z.string().min(1).max(1_000),
          profileId: z.string().min(1),
        },
      },
      async ({ question, profileId }) => safeCall(() => collectEvidence(service, question, profileId)),
    )
  }

  if (projects) {
    server.registerTool("list_projects", { description: "List projects registered in this Resource Inspector hub" }, async () =>
      safeCall(async () => ({ projects: await projects.list() })),
    )
    server.registerTool(
      "ask_project",
      {
        description:
          "Collect bounded, read-only service evidence for a question about one registered project in an explicitly selected local or cloud profile. Use the evidence to answer; this tool does not execute commands or queries from the question.",
        inputSchema: { projectId: z.string().min(1), profileId: z.string().min(1), question: z.string().min(1).max(1_000) },
      },
      async ({ projectId, profileId, question }) =>
        safeCall(async () => {
          const project = await projects.resolve(projectId)
          const projectService = await projects.service(projectId)

          return { project: { id: project.id, name: project.name }, ...(await collectEvidence(projectService, question, profileId)) }
        }),
    )
  }

  return server
}

async function collectEvidence(service: InspectorService, question: string, selectedProfileId?: string) {
  const profiles = service.listProfiles().filter(({ id }) => !selectedProfileId || id === selectedProfileId)
  if (!profiles.length) throw new Error(OperationalText.SelectedProfileIsNotConfigured)
  const evidence = await Promise.all(
    profiles.map(async (profile) => {
      const resources = service.listResources(profile.id).slice(0, EvidencePolicy.MaximumResources)
      const observations = await Promise.all(
        resources.map(async (resource) => {
          const status = await settled(() => service.getResourceStatus(profile.id, resource.id))
          const views = (resource.views ?? []).filter(isSafeEvidenceView).slice(0, EvidencePolicy.MaximumViewsPerResource)
          const inspections = await Promise.all(
            views.map(async (view) => ({
              view,
              result: await settled(() => service.inspectResource(profile.id, resource.id, view, evidenceInput(view))),
            })),
          )

          return { resource: { id: resource.id, name: resource.name, kind: resource.kind }, status, inspections }
        }),
      )

      return { profile: { id: profile.id, name: profile.name, kind: profile.kind }, resources: observations }
    }),
  )

  return {
    question,
    evidence,
    limitations: [
      "Read-only bounded evidence; no arbitrary SQL, shell, or log query was run.",
      "Database row contents and queue job payloads are excluded.",
    ],
  }
}

function isSafeEvidenceView(view: string) {
  return ["logs", "requests", "tables", "summary"].includes(view)
}

function evidenceInput(view: string) {
  return view === "logs" || view === "requests" ? { limit: EvidencePolicy.LogLimit, minutes: EvidencePolicy.LogMinutes } : {}
}

async function settled(operation: () => unknown | Promise<unknown>) {
  try {
    return { ok: true, value: await operation() }
  } catch {
    return { ok: false, error: OperationalText.ResourceInspectionFailed }
  }
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

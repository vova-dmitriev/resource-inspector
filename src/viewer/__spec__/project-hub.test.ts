import { afterEach, describe, expect, it } from "vitest"
import { createProjectHub } from "../project-hub.js"

const mapHtml =
  '<script type="application/json" id="map-data">{"resourceProfiles":[{"id":"local"}],"tabs":[{"diagrams":[{"nodes":[{"id":"api","resourceRefsByProfile":{"local":["api"]}}]}]}]}</script>'
const projects = [
  {
    id: "tickets",
    name: "Tickets",
    mapPath: "/projects/tickets/map.html",
    configPath: "/projects/tickets/profiles.json",
    envPath: "/projects/tickets/.env",
  },
  {
    id: "billing",
    name: "Billing",
    mapPath: "/projects/billing/map.html",
    configPath: "/projects/billing/profiles.json",
    envPath: "/projects/billing/.env",
  },
] as const
const servers: Array<ReturnType<typeof createProjectHub>> = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))),
  )
})

describe("createProjectHub", () => {
  it("lists project names and serves each project's own map", async () => {
    const server = await startHub()
    const origin = server.origin

    await expect(fetch(`${origin}/__resource-inspector/projects`).then((response) => response.json())).resolves.toEqual({
      projects: [
        { id: "tickets", name: "Tickets" },
        { id: "billing", name: "Billing" },
      ],
    })
    await expect(fetch(`${origin}/projects/tickets/`).then((response) => response.text())).resolves.toContain('id="map-data"')
  })

  it("keeps identical profile and resource IDs isolated by project URL", async () => {
    const server = await startHub()
    const origin = server.origin

    const ticketsStatus = await fetch(`${origin}/projects/tickets/__resource-inspector/status?profileId=local&resourceId=api`).then(
      (response) => response.json(),
    )
    const billingStatus = await fetch(`${origin}/projects/billing/__resource-inspector/status?profileId=local&resourceId=api`).then(
      (response) => response.json(),
    )
    const ticketsInspection = await fetch(`${origin}/projects/tickets/__resource-inspector/inspect`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ profileId: "local", resourceId: "api", view: "logs" }),
    }).then((response) => response.json())

    expect(ticketsStatus.state).toBe("running")
    expect(billingStatus.state).toBe("stopped")
    expect(ticketsInspection).toEqual({ project: "tickets", view: "logs" })
  })

  it("rejects foreign origins on project management and inspection routes", async () => {
    const server = await startHub()
    const response = await fetch(`${server.origin}/__resource-inspector/projects/tickets`, {
      method: "DELETE",
      headers: { origin: "https://attacker.example" },
    })

    expect(response.status).toBe(403)
  })
})

async function startHub() {
  const catalog = {
    list: async () => projects.map(({ id, name }) => ({ id, name })),
    resolve: async (id: string) => {
      const project = projects.find((item) => item.id === id)

      if (!project) throw new Error("Unknown project")

      return project
    },
    add: async () => projects[0],
    update: async () => projects[0],
    remove: async () => {},
  }
  const server = createProjectHub({
    catalog,
    createRuntime: async (project) => ({
      html: mapHtml,
      map: {
        resourceProfiles: [{ id: "local" }],
        tabs: [{ diagrams: [{ nodes: [{ resourceRefsByProfile: { local: ["api"] } }] }] }],
      },
      service: {
        listProfiles: () => [{ id: "local", name: "Local", kind: "local" as const }],
        listResources: () => [{ id: "api", name: "API", views: ["status", "logs"] }],
        getResourceStatus: async () => ({
          state: project.id === "tickets" ? ("running" as const) : ("stopped" as const),
          checkedAt: "now",
        }),
        inspectResource: async (_profileId: string, _resourceId: string, view: string) => ({ project: project.id, view }),
      },
      settings: {
        list: async () => ({ profiles: [] }),
        updateSecrets: async () => ({ profiles: [] }),
      },
    }),
  })

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()

  if (!address || typeof address === "string") throw new Error("Viewer did not bind")
  servers.push(server)

  return { server, origin: `http://127.0.0.1:${address.port}` }
}

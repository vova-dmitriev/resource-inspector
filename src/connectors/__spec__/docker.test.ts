import { describe, expect, it, vi } from "vitest"
import { createDockerConnector } from "../docker.js"

const OperationalText = {
  Line1Line2: "line-1\nline-2\n",
  Up3Minutes: "Up 3 minutes",
  Up3MinutesUnhealthy: "Up 3 minutes (unhealthy)",
  UpHealthStarting: "Up 3 minutes (health: starting)",
} as const
const DockerTestPolicy = { StoppedExitCode: 137 } as const

describe("createDockerConnector", () => {
  it("maps Docker lifecycle states and exposes bounded container logs", async () => {
    const command = vi.fn(async (args: readonly string[]) =>
      args[0] === "container" ? '{"Names":"tickets-api","State":"running","Status":"Up 3 minutes"}' : OperationalText.Line1Line2,
    )

    const connector = createDockerConnector(
      {
        id: "docker-local",
        type: "docker",
        resources: [{ id: "api", name: "API" }],
        options: { containers: { api: "tickets-api" } },
      },
      command,
    )

    await expect(connector.status?.("api")).resolves.toMatchObject({
      state: "running",
      detail: OperationalText.Up3Minutes,
    })
    await expect(connector.inspect("api", "logs", { limit: 1 })).resolves.toEqual({ lines: ["line-1", "line-2"] })
    expect(command).toHaveBeenLastCalledWith(["logs", "--tail", "1", "tickets-api"])
  })

  it("reports stopped containers and exit codes", async () => {
    const connector = createDockerConnector(
      {
        id: "docker-local",
        type: "docker",
        resources: [{ id: "api", name: "API" }],
        options: { containers: { api: "tickets-api" } },
      },
      async () => '{"Names":"tickets-api","State":"exited","Status":"Exited (137) 2 minutes ago"}',
    )

    await expect(connector.status?.("api")).resolves.toMatchObject({
      state: "stopped",
      exitCode: DockerTestPolicy.StoppedExitCode,
    })
  })

  it("distinguishes a running container with a failed health check", async () => {
    const connector = createDockerConnector(
      {
        id: "docker-local",
        type: "docker",
        resources: [{ id: "api", name: "API" }],
        options: { containers: { api: "tickets-api" } },
      },
      async () => '{"Names":"tickets-api","State":"running","Status":"Up 3 minutes (unhealthy)","Health":"unhealthy"}',
    )

    await expect(connector.status?.("api")).resolves.toMatchObject({
      state: "degraded",
      detail: OperationalText.Up3MinutesUnhealthy,
    })
  })

  it("reports containers whose health check is still starting", async () => {
    const connector = createDockerConnector(
      {
        id: "docker-local",
        type: "docker",
        resources: [{ id: "api", name: "API" }],
        options: { containers: { api: "tickets-api" } },
      },
      async () => JSON.stringify({ Names: "tickets-api", State: "running", Status: OperationalText.UpHealthStarting, Health: "starting" }),
    )

    await expect(connector.status?.("api")).resolves.toMatchObject({ state: "starting" })
  })
})

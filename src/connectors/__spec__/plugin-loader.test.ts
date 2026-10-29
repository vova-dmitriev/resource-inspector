import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadConnectorModules } from "../plugin-loader.js"

const OperationalText = {
  ConnectorModuleMustBeRelative: "Connector modules must use relative paths",
  ConnectorModuleEscapesProject: "Connector module is outside the project directory",
} as const

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("loadConnectorModules", () => {
  it("loads project-local registrations with environment defaults", async () => {
    const directory = await createDirectory()
    const modulePath = join(directory, "connector.mjs")

    await writeFile(
      modulePath,
      "export function registerConnectors(environment) { return { custom: (configuration) => ({ resources: configuration.resources, inspect: async () => ({ connected: Boolean(environment.CUSTOM_URL) }) }) } }",
    )

    const factories = await loadConnectorModules(["./connector.mjs"], { CUSTOM_URL: "configured" }, directory)
    const connector = factories.custom?.({
      id: "custom",
      type: "custom",
      resources: [{ id: "resource", name: "Resource" }],
    })

    await expect(connector?.inspect("resource", "status")).resolves.toEqual({
      connected: true,
    })
  })

  it("requires connector modules to be relative to the profile configuration", async () => {
    await expect(loadConnectorModules(["https://example.invalid/plugin.mjs"], {}, tmpdir())).rejects.toThrow(
      OperationalText.ConnectorModuleMustBeRelative,
    )
  })

  it("blocks module paths that escape the project directory", async () => {
    const directory = await createDirectory()
    const configurationDirectory = join(directory, ".resource-inspector")

    await expect(loadConnectorModules(["../../outside.mjs"], {}, configurationDirectory)).rejects.toThrow(
      OperationalText.ConnectorModuleEscapesProject,
    )
  })
})

async function createDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "resource-inspector-plugin-"))

  directories.push(directory)

  return directory
}

import { realpath } from "node:fs/promises"
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"
import type { ConnectorFactory, ConnectorRegistration } from "../model/types.js"

const OperationalText = {
  ConnectorModuleMustBeRelative: "Connector modules must use relative paths",
  ConnectorModuleEscapesProject: "Connector module is outside the project directory",
  ConnectorModuleRegistrationMissing: "Connector module must export registerConnectors",
  InvalidConnectorRegistration: "Connector registration is invalid",
  DuplicateConnectorType: "Duplicate connector type",
} as const

const ConnectorPolicy = { TypePattern: /^[a-zA-Z0-9_.-]{1,64}$/ } as const
const BuiltInConnectorTypes = new Set(["docker", "http-health", "postgres", "bullmq", "loki"])

export async function loadConnectorModules(
  modulePaths: readonly string[],
  environment: Readonly<Record<string, string>>,
  configurationDirectory: string,
) {
  const registrations: Record<string, ConnectorFactory> = {}

  for (const modulePath of modulePaths) {
    if (!modulePath.startsWith("./") && !modulePath.startsWith("../")) throw new Error(OperationalText.ConnectorModuleMustBeRelative)
    const projectDirectory =
      basename(configurationDirectory) === ".resource-inspector" ? dirname(configurationDirectory) : configurationDirectory
    const moduleFilePath = resolve(configurationDirectory, modulePath)

    assertInsideProject(relative(projectDirectory, moduleFilePath))

    const [canonicalProjectDirectory, canonicalModulePath] = await Promise.all([realpath(projectDirectory), realpath(moduleFilePath)])

    assertInsideProject(relative(canonicalProjectDirectory, canonicalModulePath))

    const imported = (await import(pathToFileURL(canonicalModulePath).href)) as {
      registerConnectors?: ConnectorRegistration
    }

    if (typeof imported.registerConnectors !== "function") throw new Error(OperationalText.ConnectorModuleRegistrationMissing)

    const factories = await imported.registerConnectors(environment)

    for (const [type, factory] of Object.entries(factories)) {
      if (!ConnectorPolicy.TypePattern.test(type) || typeof factory !== "function")
        throw new Error(OperationalText.InvalidConnectorRegistration)
      if (BuiltInConnectorTypes.has(type) || registrations[type]) throw new Error(OperationalText.DuplicateConnectorType)

      registrations[type] = factory
    }
  }

  return registrations
}

function assertInsideProject(projectRelativePath: string) {
  if (projectRelativePath === ".." || projectRelativePath.startsWith(`..${sep}`) || isAbsolute(projectRelativePath)) {
    throw new Error(OperationalText.ConnectorModuleEscapesProject)
  }
}

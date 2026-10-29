import { createConnectorFactories } from "../connectors/factories.js"
import { createInspectorService } from "../model/inspector.js"
import type { ConnectorFactory, ProfileConfiguration } from "../model/types.js"
import { loadProfileConfiguration, writeSecretOverrides } from "./profile-config.js"

const SecretSettingsPolicy = { MaximumValueLength: 4_096 } as const

const OperationalText = {
  UnknownProfile: "Unknown profile",
  UnknownSecretSetting: "Unknown secret setting",
  SecretSettingIsTooLarge: "Secret setting is too large",
  ConnectionCheckFailed: "Connection check failed",
} as const

type ConnectionValidator = (
  profile: ProfileConfiguration,
  environment: Readonly<Record<string, string>>,
  changedNames: ReadonlySet<string>,
) => Promise<void>

type ConfigurationUpdated = (
  profiles: readonly ProfileConfiguration[],
  environment: Readonly<Record<string, string>>,
) => void | Promise<void>

export function createProfileSettingsService(
  configurationPath: string,
  environmentPath: string,
  processEnvironment: NodeJS.ProcessEnv = process.env,
  validateConnections: ConnectionValidator = validateProfileConnections,
  configurationUpdated?: ConfigurationUpdated,
) {
  async function list() {
    const { profiles, environment } = await loadProfileConfiguration(configurationPath, environmentPath, processEnvironment)

    return {
      profiles: profiles.map(({ id, name, kind, connectors }) => ({
        id,
        name,
        kind,
        connectors: connectors.map(({ id: connectorId, type, environment: variables = {} }) => ({
          id: connectorId,
          type,
          settings: Object.entries(variables).map(([key, variable]) => ({
            key,
            variable,
            configured: Boolean(environment[variable]),
          })),
        })),
      })),
    }
  }

  async function updateSecrets(profileId: string, values: Readonly<Record<string, string>>) {
    const loaded = await loadProfileConfiguration(configurationPath, environmentPath, processEnvironment)
    const profile = loaded.profiles.find(({ id }) => id === profileId)

    if (!profile) throw new Error(OperationalText.UnknownProfile)
    const allowed = new Set(profile.connectors.flatMap(({ environment: variables }) => Object.values(variables ?? {})))

    if (!Object.keys(values).length || Object.keys(values).some((name) => !allowed.has(name)))
      throw new Error(OperationalText.UnknownSecretSetting)
    if (Object.values(values).some((value) => value.length > SecretSettingsPolicy.MaximumValueLength)) {
      throw new Error(OperationalText.SecretSettingIsTooLarge)
    }

    await validateConnections(profile, { ...loaded.environment, ...values }, new Set(Object.keys(values)))
    await writeSecretOverrides(configurationPath, profileId, values)
    await configurationUpdated?.(loaded.profiles, {
      ...loaded.environment,
      ...values,
    })

    return list()
  }

  return { list, updateSecrets }
}

export async function validateProfileConnections(
  profile: ProfileConfiguration,
  environment: Readonly<Record<string, string>>,
  changedNames: ReadonlySet<string>,
  additionalFactories: Readonly<Record<string, ConnectorFactory>> = {},
) {
  const affected = profile.connectors.filter(({ environment: variables }) =>
    Object.values(variables ?? {}).some((name) => changedNames.has(name)),
  )

  const service = createInspectorService({
    profiles: [profile],
    factories: createConnectorFactories(environment, additionalFactories),
  })

  for (const connector of affected) {
    for (const resource of connector.resources) {
      const status = await service.getResourceStatus(profile.id, resource.id)

      if (status.state !== "running") throw new Error(OperationalText.ConnectionCheckFailed)
    }
  }
}

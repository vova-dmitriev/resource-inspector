import { randomUUID } from "node:crypto"
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { z } from "zod"
import type { ProfileConfiguration } from "../model/types.js"
import { parseEnvironmentFile } from "./environment.js"

const OperationalText = {
  UnknownProfile: "Unknown profile",
  UnknownSecretSetting: "Unknown secret setting",
  SecretSettingIsTooLarge: "Secret setting is too large",
  InvalidSecretSettingsFile: "Invalid secret settings file",
  UnableToReadSecretSettingsFile: "Unable to read secret settings file",
  UnableToReadEnvironmentFile: "Unable to read environment file",
  DuplicateProfileID: "Duplicate profile ID",
  EnvironmentVariableIsSharedAcrossProfiles: "Environment variable is shared across profiles",
} as const

const ConfigPolicy = {
  Directory: ".resource-inspector",
  SecretsFile: "secrets.json",
  DirectoryMode: 0o700,
  FileMode: 0o600,
  MaximumSecretValueLength: 4_096,
} as const

const ResourceSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_.-]{1,96}$/),
  name: z.string().min(1),
  kind: z.string().optional(),
  views: z.array(z.string()).optional(),
})

const ConnectorSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_.-]{1,96}$/),
  type: z.string().regex(/^[a-zA-Z0-9_.-]{1,64}$/),
  resources: z.array(ResourceSchema),
  options: z.record(z.unknown()).optional(),
  environment: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)).optional(),
})

const ProfileSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_.-]{1,96}$/),
  name: z.string().min(1),
  kind: z.enum(["local", "cloud"]),
  connectors: z.array(ConnectorSchema),
})

const ProfileDocumentSchema = z.object({
  profiles: z.array(ProfileSchema).min(1),
  connectorModules: z.array(z.string().min(1)).optional(),
})

export async function loadProfileConfiguration(
  configurationPath: string,
  environmentPath: string,
  processEnvironment: NodeJS.ProcessEnv = process.env,
) {
  const document = ProfileDocumentSchema.parse(JSON.parse(await readFile(configurationPath, "utf8")))

  assertUniqueProfiles(document.profiles)
  assertUniqueSecretVariables(document.profiles as readonly ProfileConfiguration[])
  const fileValues = parseEnvironmentFile(await readOptionalFile(environmentPath))

  const processValues = Object.fromEntries(
    Object.entries(processEnvironment).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  )

  const overrides = await readSecrets(configurationPath)

  return {
    profiles: document.profiles as readonly ProfileConfiguration[],
    connectorModules: document.connectorModules ?? [],
    environment: { ...fileValues, ...processValues, ...overrides },
  }
}

export async function writeSecretOverrides(configurationPath: string, profileId: string, values: Readonly<Record<string, string>>) {
  const document = ProfileDocumentSchema.parse(JSON.parse(await readFile(configurationPath, "utf8")))
  const profile = document.profiles.find(({ id }) => id === profileId)

  if (!profile) throw new Error(OperationalText.UnknownProfile)
  const allowed = new Set(profile.connectors.flatMap(({ environment }) => Object.values(environment ?? {})))

  if (Object.keys(values).some((key) => !allowed.has(key))) throw new Error(OperationalText.UnknownSecretSetting)
  if (Object.values(values).some((value) => value.length > ConfigPolicy.MaximumSecretValueLength))
    throw new Error(OperationalText.SecretSettingIsTooLarge)

  const directory = secretsDirectory(configurationPath)

  await mkdir(directory, { recursive: true, mode: ConfigPolicy.DirectoryMode })
  await chmod(directory, ConfigPolicy.DirectoryMode)
  const path = join(directory, ConfigPolicy.SecretsFile)
  const current = await readJson(path)
  const next = { ...current, ...values }
  const temporary = `${path}.${randomUUID()}.tmp`

  try {
    await writeFile(temporary, JSON.stringify(next), {
      mode: ConfigPolicy.FileMode,
    })
    await chmod(temporary, ConfigPolicy.FileMode)
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

async function readSecrets(configurationPath: string): Promise<Record<string, string>> {
  return readJson(join(secretsDirectory(configurationPath), ConfigPolicy.SecretsFile))
}

function secretsDirectory(configurationPath: string) {
  const directory = dirname(configurationPath)

  return basename(directory) === ConfigPolicy.Directory ? directory : join(directory, ConfigPolicy.Directory)
}

async function readJson(path: string): Promise<Record<string, string>> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"))

    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(OperationalText.InvalidSecretSettingsFile)
    if (Object.values(value).some((item) => typeof item !== "string")) throw new Error(OperationalText.InvalidSecretSettingsFile)

    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
  } catch (error) {
    if (isMissingFile(error)) return {}
    throw new Error(OperationalText.UnableToReadSecretSettingsFile)
  }
}

async function readOptionalFile(path: string) {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (isMissingFile(error)) return ""
    throw new Error(OperationalText.UnableToReadEnvironmentFile)
  }
}

function assertUniqueProfiles(profiles: readonly Readonly<{ id: string }>[]) {
  if (new Set(profiles.map(({ id }) => id)).size !== profiles.length) throw new Error(OperationalText.DuplicateProfileID)
}

function assertUniqueSecretVariables(profiles: readonly ProfileConfiguration[]) {
  const owners = new Map<string, string>()

  for (const profile of profiles) {
    for (const variable of profile.connectors.flatMap(({ environment }) => Object.values(environment ?? {}))) {
      const owner = owners.get(variable)

      if (owner && owner !== profile.id) throw new Error(OperationalText.EnvironmentVariableIsSharedAcrossProfiles)
      owners.set(variable, profile.id)
    }
  }
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT")
}

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { loadProfileConfiguration, writeSecretOverrides } from "../profile-config.js"
import { createProfileSettingsService } from "../settings.js"

const OperationalText = {
  EnvironmentVariableIsSharedAcrossProfiles: "Environment variable is shared across profiles",
  NotJson: "not json",
  UnableToReadSecretSettingsFile: "Unable to read secret settings file",
  UnableToReadEnvironmentFile: "Unable to read environment file",
  UnknownSecretSetting: "Unknown secret setting",
  ConnectionCheckFailed: "Connection check failed",
  ENOENT: "ENOENT",
} as const

const roots: string[] = []
const PermissionPolicy = {
  PermissionMask: 0o777,
  OwnerOnlyFile: 0o600,
} as const

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("profile configuration", () => {
  it("loads .env defaults, then process values, then local secret overrides", async () => {
    const root = await createRoot()

    await writeFile(join(root, "profiles.json"), configurationJson())
    await writeFile(join(root, ".env"), "DATABASE_URL=from-dotenv\n")
    await mkdir(join(root, ".resource-inspector"), { recursive: true })
    await writeFile(join(root, ".resource-inspector", "secrets.json"), JSON.stringify({ DATABASE_URL: "from-override" }))

    const loaded = await loadProfileConfiguration(join(root, "profiles.json"), join(root, ".env"), { DATABASE_URL: "from-process" })

    expect(loaded.environment.DATABASE_URL).toBe("from-override")
    expect(loaded.profiles[0]?.connectors[0]?.environment?.connectionString).toBe("DATABASE_URL")
  })

  it("rejects environment variables shared across local and cloud profiles", async () => {
    const root = await createRoot()
    const path = join(root, "profiles.json")

    await writeFile(
      path,
      JSON.stringify({
        profiles: [
          {
            id: "local",
            name: "Local",
            kind: "local",
            connectors: [
              {
                id: "db",
                type: "postgres",
                resources: [{ id: "db", name: "Database" }],
                environment: { connectionString: "DATABASE_URL" },
              },
            ],
          },
          {
            id: "cloud",
            name: "Cloud",
            kind: "cloud",
            connectors: [
              {
                id: "db",
                type: "postgres",
                resources: [{ id: "db", name: "Database" }],
                environment: { connectionString: "DATABASE_URL" },
              },
            ],
          },
        ],
      }),
    )

    const load = loadProfileConfiguration(path, join(root, ".env"), {})

    await expect(load).rejects.toThrow(OperationalText.EnvironmentVariableIsSharedAcrossProfiles)
  })

  it("reports malformed secret settings instead of ignoring them", async () => {
    const root = await createRoot()
    const path = join(root, "profiles.json")

    await writeFile(path, configurationJson())
    await mkdir(join(root, ".resource-inspector"), { recursive: true })
    await writeFile(join(root, ".resource-inspector", "secrets.json"), OperationalText.NotJson)

    const load = loadProfileConfiguration(path, join(root, ".env"), {})

    await expect(load).rejects.toThrow(OperationalText.UnableToReadSecretSettingsFile)
  })

  it("reports unreadable environment-file paths instead of treating them as empty", async () => {
    const root = await createRoot()
    const path = join(root, "profiles.json")

    await writeFile(path, configurationJson())
    await mkdir(join(root, "environment-directory"))

    await expect(loadProfileConfiguration(path, join(root, "environment-directory"), {})).rejects.toThrow(
      OperationalText.UnableToReadEnvironmentFile,
    )
  })

  it("only edits referenced secret variables and writes the secret file with owner-only permissions", async () => {
    const root = await createRoot()
    const path = join(root, "profiles.json")

    await writeFile(path, configurationJson())

    await expect(
      writeSecretOverrides(path, "local", {
        DATABASE_URL: "postgresql://localhost/tickets",
        UNUSED: "nope",
      }),
    ).rejects.toThrow(OperationalText.UnknownSecretSetting)

    await writeSecretOverrides(path, "local", {
      DATABASE_URL: "postgresql://localhost/tickets",
    })

    const secretPath = join(root, ".resource-inspector", "secrets.json")

    expect(JSON.parse(await readFile(secretPath, "utf8"))).toEqual({
      DATABASE_URL: "postgresql://localhost/tickets",
    })
    expect((await stat(secretPath)).mode & PermissionPolicy.PermissionMask).toBe(PermissionPolicy.OwnerOnlyFile)
  })

  it("shows secret configuration state without values and saves only after connection validation", async () => {
    const root = await createRoot()
    const path = join(root, "profiles.json")

    await writeFile(path, configurationJson())
    await writeFile(join(root, ".env"), "DATABASE_URL=hidden-dsn\n")

    const settings = createProfileSettingsService(path, join(root, ".env"), {}, async () => {
      throw new Error(OperationalText.ConnectionCheckFailed)
    })

    const listed = await settings.list()

    expect(JSON.stringify(listed)).not.toContain("hidden-dsn")

    expect(listed.profiles[0]?.connectors[0]?.settings[0]).toMatchObject({
      key: "connectionString",
      variable: "DATABASE_URL",
      configured: true,
    })

    await expect(settings.updateSecrets("local", { DATABASE_URL: "replacement" })).rejects.toThrow(OperationalText.ConnectionCheckFailed)
    const secretPath = join(root, ".resource-inspector", "secrets.json")

    await expect(readFile(secretPath, "utf8")).rejects.toMatchObject({
      code: OperationalText.ENOENT,
    })
  })

  it("saves a checked replacement and rebuilds active settings without returning the value", async () => {
    const root = await createRoot()
    const path = join(root, "profiles.json")
    const replacement = "postgresql://localhost/updated"
    const configurationUpdated = vi.fn()

    await writeFile(path, configurationJson())

    const settings = createProfileSettingsService(
      path,
      join(root, ".env"),
      {},
      async () => {},
      (_profiles, environment) => configurationUpdated(Boolean(environment.DATABASE_URL)),
    )

    const listed = await settings.updateSecrets("local", { DATABASE_URL: replacement })
    const secretPath = join(root, ".resource-inspector", "secrets.json")

    expect(configurationUpdated).toHaveBeenCalledWith(true)
    expect(JSON.stringify(listed)).not.toContain(replacement)
    expect(JSON.parse(await readFile(secretPath, "utf8"))).toEqual({ DATABASE_URL: replacement })
  })
})

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "resource-inspector-"))

  roots.push(root)

  return root
}

function configurationJson() {
  return JSON.stringify({
    profiles: [
      {
        id: "local",
        name: "Local",
        kind: "local",
        connectors: [
          {
            id: "db",
            type: "postgres",
            resources: [{ id: "db", name: "Database" }],
            environment: { connectionString: "DATABASE_URL" },
          },
        ],
      },
    ],
  })
}

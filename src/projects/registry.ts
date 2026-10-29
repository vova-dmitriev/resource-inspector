import { randomUUID } from "node:crypto"
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { isAbsolute, dirname } from "node:path"
import { z } from "zod"
import type { ProjectRegistry, ProjectRecord } from "./types.js"

const OperationalText = {
  DuplicateProjectID: "Duplicate project ID",
  InvalidProjectRegistry: "Invalid project registry",
  UnableToReadProjectRegistry: "Unable to read project registry",
} as const

const RegistryPolicy = {
  DirectoryMode: 0o700,
  FileMode: 0o600,
  IDPattern: /^[a-zA-Z0-9_.-]{1,96}$/,
  NameLength: 160,
} as const

const ProjectRecordSchema = z.object({
  id: z.string().regex(RegistryPolicy.IDPattern),
  name: z.string().trim().min(1).max(RegistryPolicy.NameLength),
  mapPath: z.string().refine(isAbsolute),
  configPath: z.string().refine(isAbsolute),
  envPath: z.string().refine(isAbsolute),
})

const ProjectRegistrySchema = z.object({
  projects: z.array(ProjectRecordSchema),
})

export async function readProjectRegistry(registryPath: string): Promise<ProjectRegistry> {
  let value: unknown

  try {
    value = JSON.parse(await readFile(registryPath, "utf8"))
  } catch (error) {
    if (isMissingFile(error)) return { projects: [] }
    throw new Error(OperationalText.UnableToReadProjectRegistry)
  }

  return parseProjectRegistry(value)
}

export async function writeProjectRegistry(registryPath: string, registry: ProjectRegistry): Promise<void> {
  const validated = parseProjectRegistry(registry)
  const directory = dirname(registryPath)
  const temporaryPath = `${registryPath}.${randomUUID()}.tmp`

  await mkdir(directory, { recursive: true, mode: RegistryPolicy.DirectoryMode })
  await chmod(directory, RegistryPolicy.DirectoryMode)

  try {
    await writeFile(temporaryPath, JSON.stringify(validated, null, 2) + "\n", { mode: RegistryPolicy.FileMode })
    await chmod(temporaryPath, RegistryPolicy.FileMode)
    await rename(temporaryPath, registryPath)
  } catch {
    throw new Error(OperationalText.UnableToReadProjectRegistry)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

export function parseProjectRegistry(value: unknown): ProjectRegistry {
  const parsed = ProjectRegistrySchema.safeParse(value)

  if (!parsed.success) throw new Error(OperationalText.InvalidProjectRegistry)
  const ids = parsed.data.projects.map(({ id }) => id)

  if (new Set(ids).size !== ids.length) throw new Error(OperationalText.DuplicateProjectID)

  return parsed.data as ProjectRegistry
}

export function parseProjectRecord(value: unknown): ProjectRecord {
  const parsed = ProjectRecordSchema.safeParse(value)

  if (!parsed.success) throw new Error(OperationalText.InvalidProjectRegistry)

  return parsed.data
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT")
}

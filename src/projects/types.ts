export type ProjectRecord = Readonly<{
  id: string
  name: string
  mapPath: string
  configPath: string
  envPath: string
}>

export type ProjectRegistry = Readonly<{
  projects: readonly ProjectRecord[]
}>

export type ProjectInput = Omit<ProjectRecord, "id">

export type ProjectSummary = Readonly<{
  id: string
  name: string
}>

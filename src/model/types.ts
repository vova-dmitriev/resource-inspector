export type ProfileKind = "local" | "cloud"

export type ResourceDescriptor = Readonly<{
  id: string
  name: string
  kind?: string
  views?: readonly string[]
}>

export type ConnectorConfiguration = Readonly<{
  id: string
  type: string
  resources: readonly ResourceDescriptor[]
  options?: Readonly<Record<string, unknown>>
  environment?: Readonly<Record<string, string>>
}>

export type ProfileConfiguration = Readonly<{
  id: string
  name: string
  kind: ProfileKind
  connectors: readonly ConnectorConfiguration[]
}>

export type ResourceConnector = Readonly<{
  resources: readonly ResourceDescriptor[]
  status?(resourceId: string): Promise<ResourceStatus>
  inspect(resourceId: string, view: string, input?: Readonly<Record<string, unknown>>): Promise<unknown>
}>

export type ResourceStatus = Readonly<{
  state: "running" | "starting" | "stopped" | "degraded" | "unreachable" | "unknown"
  checkedAt: string
  detail?: string
  exitCode?: number
}>

export type ConnectorFactory = (configuration: ConnectorConfiguration) => ResourceConnector

export type ConnectorRegistration = (
  environment: Readonly<Record<string, string>>,
) => Readonly<Record<string, ConnectorFactory>> | Promise<Readonly<Record<string, ConnectorFactory>>>

export type InspectorConfiguration = Readonly<{
  profiles: readonly ProfileConfiguration[]
  factories: Readonly<Record<string, ConnectorFactory>>
}>

export type ProfileDescriptor = Readonly<{
  id: string
  name: string
  kind: ProfileKind
}>

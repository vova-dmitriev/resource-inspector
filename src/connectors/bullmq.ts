import { redact } from "../security/redaction.js"
import { type Job, Queue } from "bullmq"
import { Redis } from "ioredis"
import type { ConnectorConfiguration, ResourceConnector } from "../model/types.js"

const OperationalText = {
  QueueInspectionFailed: "Queue inspection failed",
  UnsupportedQueueView: "Unsupported queue view",
  QueueBindingsAreRequired: "Queue bindings are required",
  UnknownQueueResource: "Unknown queue resource",
} as const

const QueuePolicy = {
  TimeoutMs: 4_000,
  DefaultLimit: 50,
  MaximumLimit: 100,
} as const
const QueueStates = ["waiting", "active", "delayed", "failed", "completed"] as const

type QueueClient = Readonly<{
  getJobCounts(...types: readonly string[]): Promise<Record<string, number>>
  getJobs(types: readonly string[], start: number, end: number): Promise<readonly Job[]>
  close(): Promise<void>
}>

type BullOptions = Readonly<{
  redisUrl: string
  queueFactory?: (name: string, redisUrl: string) => QueueClient
}>

export function createBullMqConnector(configuration: ConnectorConfiguration, { redisUrl, queueFactory = createQueue }: BullOptions) {
  const queues = readQueueBindings(configuration)
  const resources = configuration.resources.map((resource) => ({
    ...resource,
    views: ["status", "summary", "jobs"],
  }))

  async function withQueue<T>(resourceId: string, operation: (queue: QueueClient, name: string) => Promise<T>) {
    const name = queueName(queues, resourceId)
    const queue = queueFactory(name, redisUrl)

    try {
      return await operation(queue, name)
    } catch {
      throw new Error(OperationalText.QueueInspectionFailed)
    } finally {
      await queue.close().catch(() => undefined)
    }
  }

  async function checkStatus(resourceId: string) {
    try {
      await withQueue(resourceId, (queue) => queue.getJobCounts(...QueueStates))

      return { state: "running" as const, checkedAt: new Date().toISOString() }
    } catch {
      return {
        state: "unreachable" as const,
        checkedAt: new Date().toISOString(),
      }
    }
  }

  return {
    resources,
    status: checkStatus,
    async inspect(resourceId: string, view: string, input: Readonly<Record<string, unknown>> = {}) {
      if (view === "status") return checkStatus(resourceId)
      if (view !== "summary" && view !== "jobs") throw new Error(OperationalText.UnsupportedQueueView)

      return withQueue(resourceId, async (queue, name) => {
        if (view === "summary")
          return {
            queue: name,
            counts: await queue.getJobCounts(...QueueStates),
          }
        const requested = Number(input.limit ?? QueuePolicy.DefaultLimit)

        const limit = Math.max(
          1,
          Math.min(QueuePolicy.MaximumLimit, Math.floor(Number.isFinite(requested) ? requested : QueuePolicy.DefaultLimit)),
        )

        const jobs = await queue.getJobs(QueueStates, 0, limit - 1)

        return {
          jobs: await Promise.all(
            jobs.map(async (job) => ({
              id: job.id,
              name: job.name,
              state: await job.getState(),
              data: redact(job.data),
              timestamp: job.timestamp,
              ...(job.failedReason ? { failedReason: redact(job.failedReason) } : {}),
            })),
          ),
        }
      })
    },
  } satisfies ResourceConnector
}

function createQueue(name: string, redisUrl: string) {
  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    connectTimeout: QueuePolicy.TimeoutMs,
  })

  return new Queue(name, { connection }) as unknown as QueueClient
}

function readQueueBindings(configuration: ConnectorConfiguration) {
  const value = configuration.options?.queues

  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(OperationalText.QueueBindingsAreRequired)

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && /^[a-zA-Z0-9_.-]{1,128}$/.test(entry[1]),
    ),
  )
}

function queueName(queues: Readonly<Record<string, string>>, resourceId: string) {
  const name = queues[resourceId]

  if (!name) throw new Error(OperationalText.UnknownQueueResource)

  return name
}

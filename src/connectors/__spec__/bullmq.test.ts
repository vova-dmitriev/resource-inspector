import { describe, expect, it, vi } from "vitest"
import { createBullMqConnector } from "../bullmq.js"

const QueueTestPolicy = { RequestedJobLimit: 500, InspectionCalls: 2 } as const

describe("createBullMqConnector", () => {
  it("returns queue counts and bounded redacted job summaries", async () => {
    const queue = {
      getJobCounts: vi.fn(async () => ({ waiting: 1, active: 0, failed: 0 })),
      getJobs: vi.fn(async () => [
        {
          id: "job-1",
          name: "send-email",
          data: { email: "person@example.test" },
          timestamp: 1,
          getState: async () => "waiting",
        },
      ]),
      close: vi.fn(async () => {}),
    }

    const connector = createBullMqConnector(
      {
        id: "queues",
        type: "bullmq",
        resources: [{ id: "notifications", name: "Notifications" }],
        options: { queues: { notifications: "notifications" } },
      },
      { redisUrl: "redis://localhost", queueFactory: () => queue },
    )

    await expect(connector.inspect("notifications", "summary")).resolves.toEqual({
      queue: "notifications",
      counts: { waiting: 1, active: 0, failed: 0 },
    })

    await expect(
      connector.inspect("notifications", "jobs", {
        limit: QueueTestPolicy.RequestedJobLimit,
      }),
    ).resolves.toEqual({
      jobs: [
        {
          id: "job-1",
          name: "send-email",
          state: "waiting",
          data: { email: "[REDACTED]" },
          timestamp: 1,
        },
      ],
    })

    expect(queue.close).toHaveBeenCalledTimes(QueueTestPolicy.InspectionCalls)
  })
})

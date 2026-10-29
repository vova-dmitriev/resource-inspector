# Connector authoring

Implement a project-local ESM module and register a factory under a new connector type. A factory returns a `ResourceConnector`: declared resource descriptors, optional `status(resourceId)`, and `inspect(resourceId, view, input)`.

```js
export function registerConnectors(environment) {
  const cacheUrl = environment.CACHE_URL

  return {
    "internal-cache": (configuration) => ({
      resources: configuration.resources.map((resource) => ({ ...resource, views: ["status", "keys"] })),
      async status(resourceId) {
        assertKnownResource(configuration, resourceId)
        const client = await connectCache(cacheUrl)

        try {
          await client.ping()
          return { state: "running", checkedAt: new Date().toISOString() }
        } catch {
          return { state: "unreachable", checkedAt: new Date().toISOString(), detail: "Cache health check failed" }
        } finally {
          await client.close()
        }
      },
      async inspect(resourceId, view, input = {}) {
        if (view !== "keys") throw new Error("Unsupported cache view")
        assertKnownResource(configuration, resourceId)
        const client = await connectCache(cacheUrl)

        try {
          const requestedLimit = Number(input.limit) || 20
          const limit = Math.max(1, Math.min(50, requestedLimit))

          return { keys: await client.listKeys({ limit }) }
        } finally {
          await client.close()
        }
      },
    }),
  }
}
```

The snippet uses project-specific helpers such as `connectCache`, `assertKnownResource`, and client methods as placeholders. Replace them with the actual SDK and schema API; test connection state and bounded results against the real service. Implement `status` when environment-backed settings need connection validation in the viewer.

Add the module path to the profile document. Paths resolve relative to that JSON file and stay inside the project directory:

```json
{
  "connectorModules": ["../connectors/internal-cache.mjs"],
  "profiles": [{ "id": "local", "name": "Local", "kind": "local", "connectors": [] }]
}
```

Use the `environment` argument to resolve variables referenced by the connector configuration. Avoid including connection values in errors. Reject unknown resources and views, cap result counts and payload sizes, and redact secret-bearing records. Tests should cover limits, state mapping, invalid resource/view names, secret handling, and connection failure.

Connector modules are imported by the running process and can execute arbitrary code. They must be trusted local files. Built-in connector names are reserved.

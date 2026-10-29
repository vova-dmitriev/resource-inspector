---
name: resource-inspector
description: "Use when adding live, clickable service inspection to a project architecture map: container health, local/cloud profiles, application logs, database tables, queues, and HTTP request history."
---

# Resource Inspector

Add live inspection to the architecture map the project already uses. The user opens the same generated map and clicks a service or container node; do not build a separate dashboard.

## Workflow

1. Inspect the target project's `AGENTS.md`, architecture map manifest and generator, `.env` variable names without printing values, container orchestration files, health endpoints, log labels, database schema, and queue declarations.
2. Build this repository with `pnpm --dir <resource-inspector-repo> build` before registering or running its MCP command. Copy `profiles.example.json` to the project's `.resource-inspector/profiles.json` and merge variable names from `.env.example` only when needed. Never overwrite project files.
3. Create `local` and `cloud` profiles as needed. Keep their environment variable names distinct. Use `.env` values as defaults and let the viewer expose blank replacement fields; never put secrets in map manifests or browser storage.
4. Bind map nodes to resource IDs in each profile. Add bindings for service health, frontend/backend logs, Docker containers, database schemas/tables, queues, and request history only when those resources exist. Follow [map integration](references/map-integration.md).
5. Confirm the installed `project-architecture-map` generator supports `resourceProfiles` and `resourceRefsByProfile` and embeds the inspector panel. If it does not, update that skill's manifest validator and HTML template as part of this work. Start the generated map with `pnpm --dir <resource-inspector-repo> map --map <absolute-map-path> --config <profiles.json> --env <env-file>`. Confirm the map itself shows the profile selector and inspection panel. Click the nodes and switch profiles.
6. Register the built package as a local MCP stdio server only if the user wants to inspect resources through MCP tools. Use `pnpm --dir <resource-inspector-repo> mcp --config <profiles.json> --env <env-file>` as its command and arguments; keep configuration paths absolute.
7. For several projects in one viewer and one MCP server, start `pnpm --dir <resource-inspector-repo> hub --projects <registry.json>`. The shared registry stores project names and absolute map/config/env paths. MCP can use the same registry with `pnpm --dir <resource-inspector-repo> mcp --projects <registry.json>`, which exposes `list_projects` and `ask_project`.
8. Verify each status and view against the real source. A stopped, unhealthy, or unreachable service must remain visibly failed; do not replace a failed connection with sample data.
9. Existing application logs can be read without changing the application. Add request-history middleware only when the user specifically wants input/output capture and approves the application integration; keep it optional, redact credentials/PII before logs leave the process, impose byte limits, and check log-store retention. See [request history](references/request-history.md).
10. For an unsupported data source, author a read-only connector and register it through `connectorModules`. See [connector authoring](references/connector-authoring.md).

## Safety boundaries

- Connector views are bounded and read-only. Never expose arbitrary shell commands, SQL, Redis commands, file paths, or cloud control-plane actions as map inputs.
- The local viewer binds to loopback and checks the map's declared profile and resource bindings on every request.
- Treat connector modules as executable code. Load only project-local modules that the user trusts.
- `.env` is read-only. Secret fields are write-only; replacement values are stored in `.resource-inspector/secrets.json`. Never print environment values or include them in resource results.
- HTTP input/output capture is disabled by default. Avoid capturing authentication, identity, payment, or other sensitive bodies unless the user explicitly enables it and redaction/retention have been reviewed.
- Cloud profiles do not automatically expose cloud container control planes. Use a configured remote Docker context or add a provider connector for Kubernetes and managed container services.

## References

- [Map integration](references/map-integration.md)
- [Connector authoring](references/connector-authoring.md)
- [Request history](references/request-history.md)

# Resource Inspector

Resource Inspector is a portable MCP server and a live-inspection panel for architecture maps generated with `project-architecture-map`. It adds status checks, logs, PostgreSQL previews, BullMQ queue summaries, and structured HTTP request history to the map itself.

## Quick start

```sh
pnpm install
cp .env.example .env
mkdir -p .resource-inspector
cp profiles.example.json .resource-inspector/profiles.json
```

Edit `.resource-inspector/profiles.json` to match your container names, service health URLs, log labels, tables, and queues. Put defaults in `.env`; the viewer never edits that file. Then build and open the generated map through its local viewer:

```sh
pnpm --dir /path/to/resource-inspector build
pnpm --dir /path/to/resource-inspector map --map /absolute/path/to/architecture-map.html --config /path/to/project/.resource-inspector/profiles.json --env /path/to/project/.env
```

Open the printed `http://127.0.0.1:8765` URL. Click a bound node in the existing map to view service status and its available data. Status refreshes every 15 seconds while the node panel is open. The viewer serves the same generated map; it does not create a separate dashboard.

## MCP client

Build the package before registering it. Register an MCP stdio server with command `pnpm` and arguments `--dir /path/to/resource-inspector mcp --config /absolute/path/to/profiles.json --env /absolute/path/to/.env`. It exposes `list_profiles`, `list_resources`, `resource_status`, and `inspect_resource` tools. Each request names the selected profile and resource explicitly.

## Profiles and secrets

Each profile is marked `local` or `cloud`, so the map's profile selector switches between them. Environment values load from `.env`, then process environment variables, then local replacements saved by the viewer. Settings show only whether a value is configured. Replacements are checked before they are saved to the project's `.resource-inspector/secrets.json` with owner-only permissions. The viewer treats `.env` as read-only.

Keep profile variable names unique across local and cloud profiles. This prevents an override for one environment from changing another environment's connection.

## Request history

The Loki connector shows existing structured `HTTP request completed` entries, including request ID, method, path, status, and duration. Reading existing logs requires no application changes. Capturing input/output bodies is an optional application integration, off by default, and should be added only when explicitly requested. Review redaction and log retention before enabling it. See [the request-history guide](skills/resource-inspector/references/request-history.md).

## Add a connector

Built-in connector types are `docker`, `http-health`, `postgres`, `bullmq`, and `loki`. Add a project-local JavaScript module with an exported `registerConnectors(environment)` function, then list its relative path in the profile document's top-level `connectorModules` array. The module's code runs in the MCP process, so only load modules you trust. See [connector authoring](skills/resource-inspector/references/connector-authoring.md).

## Skill

Install `skills/resource-inspector` into your Codex skills directory to use the workflow across projects. This repository also includes a companion snapshot of the updated `project-architecture-map` skill at `integrations/project-architecture-map/skill`; install both skills when the target generator does not yet support the inspector manifest fields and embedded panel. The Resource Inspector skill covers project inventory, profile setup, map bindings, and connector selection. Request-history instrumentation remains optional. See [map integration](integrations/project-architecture-map/README.md) for how the inspector appears in generated maps.

## Development

```sh
pnpm typecheck
pnpm test
pnpm build
```

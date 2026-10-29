# Multi-project Resource Inspector

## Intent

Let one local Resource Inspector instance manage several projects. The user can connect a project, choose it from a project list, and inspect that project's own architecture map, local/cloud profiles, logs, data sources, and status.

## Goals

- Add, rename, edit, and remove connected project entries from the Resource Inspector UI.
- Store each project's display name and absolute paths to its generated map, profile configuration, and `.env` file.
- Keep the selected project's map and all inspector API requests scoped to that project.
- Preserve per-project profile selection and existing `.env` defaults and write-only secret override behavior.
- Clicking a bound map node opens a compact, centered inspector dialog with status and resource views; it does not expand an inline page section.
- Render readable setting labels and polished profile/view controls in both light and dark themes.
- Let an MCP client ask a natural-language question about a project's services and return bounded, redacted evidence for the MCP host model to explain.
- Keep project code untouched; the manager reads the selected files and stores its registry separately.

## Non-goals

- Discovering projects automatically or editing their manifests.
- Sharing projects, credentials, logs, or registry data with a remote service.
- Replacing connector configuration or changing existing map contents.
- Generating natural-language answers inside Resource Inspector; the MCP client model summarizes the returned evidence.

## Approaches

1. **Shared project manager (selected):** one loopback server with an app-level project list and add-project form. Each entry stores map, profile-config, and environment paths in a local registry. It gives one place to switch projects without requiring per-project code changes.
2. **Project-local manifest discovery:** add a manifest to every project and have the inspector discover it. This reduces form fields but adds a setup file to every connected project.
3. **One server per project:** retain the current single-map process and launch multiple instances. It avoids a registry but does not provide the requested shared screen.

## Proposed behavior

- The landing screen lists connected projects and offers **Add project**. The form accepts a display name, generated map HTML path, profile configuration path, and environment file path; the environment path defaults to `<project-root>/.env` when a project root is supplied.
- Before saving, the server validates readable files, the generated map manifest, profile configuration, and that every map-declared profile and resource binding exists in that project's configuration.
- Selecting a project opens its map in the same app. Project identity is carried in URL paths for map and API requests, avoiding a shared active-project cookie and keeping multiple tabs isolated.
- Clicking a map node opens a centered modal dialog with a clear title, resource status, and direct view tabs for logs, requests, queue summaries, and database metadata. Escape and the close button dismiss it; background page content remains in place.
- The profile control is a styled, keyboard-operable selector; per-resource views use labeled tabs/buttons rather than tiny native select controls.
- Connection settings render each environment variable as a visible label paired with its write-only input. No DOM node is stringified as text.
- The project registry defaults to `~/.resource-inspector/projects.json`, supports an explicit `--projects` path, is written atomically with owner-only permissions, and contains paths and display names only. Secret overrides continue to be stored beside each project's profile configuration.
- MCP supports a project registry mode. `list_projects` lists only project IDs and names. `ask_project` accepts `projectId`, `profileId`, a natural-language `question`, and an optional bounded time range; it collects resource health, recent logs/requests, queue summaries, and database table names from that project's read-only connectors. The MCP host model answers from this evidence; request payloads stay subject to existing redaction and opt-in capture rules.
- Removing a project removes only its registry entry; it does not delete project files or secret overrides.
- All viewer routes remain loopback-only and origin-checked. API handlers resolve the project from the route, then apply that project's existing manifest binding checks before reading resources.
- The map generator companion gains a configurable inspector URL prefix so maps served below a project URL use project-scoped routes. Existing single-map mode continues to use the root routes.

## Constraints and implementation calls

- Keep the current single-project `map --map --config --env` command working.
- Add a separate multi-project command (proposed: `hub`) so existing MCP stdio behavior remains unchanged.
- Add `mcp --projects <file>` for multi-project MCP use while keeping existing single-profile `mcp` clients compatible; the single-profile MCP server also gains an `ask_services` evidence tool.
- Do not expose file contents or environment values in the project list or validation responses.
- Project paths are local filesystem paths selected by the user; reject missing, unreadable, or invalid files with field-level errors.
- Use the existing TypeScript, Node HTTP server, Zod validation, and Vitest setup; add no UI framework or dependency.

## Open implementation details

- Build the app-level shell and project form as a small standalone HTML document served by the existing Node server.
- Keep project list controls keyboard accessible and match the existing map theme where practical.
- Add tests for registry validation/permissions, project-isolated routes and map bindings, and project add/switch/remove flow.

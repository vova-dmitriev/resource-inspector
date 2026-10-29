# Multi-project Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add one local Resource Inspector hub that registers multiple projects and opens each project's own live architecture map.

**Architecture:** Keep the current single-project map and mcp commands compatible. Add hub backed by an owner-only project registry, validated project runtimes, and project-scoped HTTP routes. Serve a project manager at / and maps at /projects/:projectId/. Make map inspection a centered modal with styled controls. Add single-project and registry-backed MCP evidence tools so the host model can answer natural-language questions from bounded read-only service data.

**Tech Stack:** TypeScript, Node HTTP server, Zod, Vitest, existing generated HTML map template.

**Spec:** docs/superpowers/specs/2026-10-29-multi-project-inspector-design.md

## Global Constraints

- Project code stays untouched; the hub reads user-selected map, profile, and environment files.
- The registry defaults to ~/.resource-inspector/projects.json, supports --projects, and stores only paths and display names.
- Write the registry atomically with owner-only permissions.
- Keep every viewer route loopback-only and origin-checked.
- Resolve a project from every scoped route and enforce that project's map profile and resource bindings.
- Keep .env values as defaults; never return them to the browser. Secret overrides remain write-only beside the project's profile configuration.
- Preserve the existing map --map --config --env and mcp command behavior.
- Add no UI framework or runtime dependency.
- Clicking a bound node opens a centered dialog, not an inline inspector panel; Escape and an explicit close button dismiss it.
- MCP returns redacted, bounded source evidence; the MCP host model produces the natural-language answer.

## Review Focus

- A project whose map references a missing profile/resource must be rejected before saving; Task 1 tests invalid bindings.
- Two projects with identical profile/resource IDs must still remain isolated; Task 2 tests route scoping with distinct service results.
- A malformed or unwritable registry must produce an actionable error and preserve the prior file; Task 1 tests atomic writes and validation.
- A foreign origin must not add/remove projects or inspect a resource; Task 2 tests origin checks on mutating and read routes.
- A generated map served below /projects/:id/ must send all inspector calls to that project's prefix; Task 3 tests every URL path and checks the browser flow.
- A settings label must render as text and its field must remain associated; Task 3 tests the element helper and checks the actual dialog.
- A natural-language MCP investigation must stay read-only, bounded, and project-scoped; Task 4 tests each source view, limits, redaction-preserving results, and unknown project handling.

---

### Task 1: Project registry and connection validation

**Files:**

- Create: src/projects/types.ts
- Create: src/projects/registry.ts
- Create: src/projects/**spec**/registry.test.ts
- Create: src/projects/catalog.ts
- Create: src/projects/**spec**/catalog.test.ts
- Modify: src/config/profile-config.ts
- Modify: src/viewer/map-access.ts

**Interfaces:**

- ProjectRecord: { id: string; name: string; mapPath: string; configPath: string; envPath: string }.
- ProjectRegistry: { projects: readonly ProjectRecord[] }.
- readProjectRegistry(registryPath: string): Promise<ProjectRegistry> returns an empty registry only when the file is absent.
- writeProjectRegistry(registryPath: string, registry: ProjectRegistry): Promise<void> writes via a same-directory temporary file, atomic rename, directory mode 0o700, and file mode 0o600.
- createProjectCatalog(registryPath, validateProject) exposes list(), add(input), update(id, input), remove(id), and resolve(id); add/update validate before persisting.
- Export a reusable profile-document parser from src/config/profile-config.ts so the catalog validates configuration using the same Zod schema as normal startup.

- [x] Step 1: Write failing registry tests for absent file, valid read/write, duplicate project IDs, malformed records, and owner-only permissions.
- [x] Step 2: Run pnpm exec vitest run src/projects/**spec**/registry.test.ts; confirm failures name the missing registry API.
- [x] Step 3: Implement and export registry types and read/write functions in src/projects/registry.ts.
- [x] Step 4: Run the registry test file; confirm it passes.
- [x] Step 5: Write failing catalog tests for valid add, rejecting missing files, rejecting missing map profiles/resources, updating a record, and removing only the registry entry.
- [x] Step 6: Run pnpm exec vitest run src/projects/**spec**/catalog.test.ts; confirm failures name the missing catalog behavior.
- [x] Step 7: Implement catalog validation with parseMapDocument, the shared profile schema, and binding checks; persist only validated records.
- [x] Step 8: Run both project test files and pnpm typecheck; commit the registry/catalog unit.

### Task 2: Project-scoped hub HTTP API

**Files:**

- Create: src/projects/runtime.ts
- Create: src/projects/**spec**/runtime.test.ts
- Create: src/viewer/project-hub.ts
- Create: src/viewer/**spec**/project-hub.test.ts
- Modify: src/cli.ts

**Interfaces:**

- createProjectRuntime(project: ProjectRecord, processEnvironment: NodeJS.ProcessEnv): Promise<ProjectRuntime> loads the map, profile configuration, connector modules, inspector service, and settings for exactly one project.
- createProjectHub({ catalog, createRuntime }) returns an HTTP server. It serves the list at /__resource-inspector/projects, map HTML at /projects/:projectId/, and profile/resource/status/inspect/settings routes under /projects/:projectId/__resource-inspector/.
- Project mutations use POST /__resource-inspector/projects, PATCH /__resource-inspector/projects/:projectId, and DELETE /__resource-inspector/projects/:projectId; all requests keep host and origin validation.
- hub --projects <file> starts the project hub; absent --projects uses join(homedir(), ".resource-inspector", "projects.json"). It shares the existing INSPECTOR_PORT handling.

- [x] Step 1: Write failing HTTP tests for project listing, map retrieval, profile/resource/status/inspect isolation, foreign-origin rejection, and delete affecting only the registry.
- [x] Step 2: Run pnpm exec vitest run src/viewer/**spec**/project-hub.test.ts; confirm expected route failures.
- [x] Step 3: Implement createProjectRuntime and inject runtime creation into createProjectHub so tests use real project files and a small connector service.
- [x] Step 4: Implement project-prefixed map and inspector routes; run the targeted hub test file and confirm isolation cases pass.
- [x] Step 5: Add the hub CLI branch before single-project profile loading; preserve existing mcp and map branches.
- [x] Step 6: Run pnpm typecheck and targeted registry/catalog/hub tests; commit the hub API unit.

### Task 3: Project manager screen and map URL prefix

**Files:**

- Create: src/viewer/project-hub-page.ts
- Create: src/viewer/**spec**/project-hub-page.test.ts
- Modify: src/viewer/project-hub.ts
- Modify: integrations/project-architecture-map/skill/templates/architecture-map.html
- Modify: integrations/project-architecture-map/skill/SKILL.md
- Modify: skills/resource-inspector/SKILL.md
- Modify: skills/resource-inspector/references/map-integration.md
- Modify: the installed project-architecture-map skill template used by the current Codex profile

**Interfaces:**

- renderProjectHubPage(projects: readonly ProjectSummary[]): string renders the project list and add/edit/remove form with no secret values.
- injectInspectorBasePath(html: string, basePath: string): string provides the project route prefix to generated maps.
- The map template reads meta[name="resource-inspector-base-path"] and prefixes every inspector API request with its value; the ordinary single-map viewer keeps an empty prefix.
- Clicking a bound SVG node calls showModal() on one native dialog. The dialog contains resource status and view buttons; each view button loads its data. Escape, close button, and backdrop click close it.
- The profile selector is a styled, accessible control; per-resource view selection uses visible button tabs instead of native select elements.
- The settings form pairs each text label and write-only input as actual child nodes; helper APIs accept variadic child nodes without stringifying them.
- The hub page exposes a project list, Add project form (name, absolute map path, absolute profile configuration path, environment path), edit and remove controls, and links selected maps to /projects/:projectId/.

- [x] Step 1: Write failing tests for empty/listed project rendering, escaped project names/paths, prefixing every profile/resources/status/inspect/settings URL, modal markup, keyboard close semantics, child-node rendering, and view-button markup.
- [x] Step 2: Run pnpm exec vitest run src/viewer/**spec**/project-hub-page.test.ts; confirm the missing renderer/prefix helper failures.
- [x] Step 3: Implement the accessible project manager page and injectInspectorBasePath; wire form actions to the catalog API.
- [x] Step 4: Update bundled and installed map templates for the modal dialog, child-node helper, accessible profile control, view buttons, and project URL prefix; verify old root-mode output remains unchanged.
- [x] Step 5: Run page, hub, registry, and map template tests; start the browser preview, click nodes, inspect logs/settings, and confirm the broken object labels and native view selects are gone.
- [x] Step 6: Commit the UI and map integration unit.

### Task 4: Natural-language MCP investigations

**Files:**

- Create: src/mcp/investigation.ts
- Create: src/mcp/**spec**/investigation.test.ts
- Create: src/mcp/project-server.ts
- Create: src/mcp/**spec**/project-server.test.ts
- Modify: src/mcp/server.ts
- Modify: src/mcp/**spec**/server.test.ts
- Modify: src/cli.ts

**Interfaces:**

- Single-project MCP keeps list_profiles, list_resources, resource_status, and inspect_resource, and adds ask_services({ profileId, question }).
- Registry-backed MCP adds list_projects and ask_project({ projectId, profileId, question }).
- The bounded evidence collector lives in src/mcp/server.ts. It gathers statuses, recent logs and request history, queue summaries, and database table names for the selected profile. It excludes database rows and queue job payloads.
- Evidence includes the question, selected profile, per-resource results, and source errors; question text is context for the host model, not executable connector input.

- [x] Step 1: Write failing investigation tests proving it reads status/logs/requests/queue summaries/table names, omits row payloads, bounds resources/results/time ranges, and reports per-resource failures without aborting the full report.
- [x] Step 2: Run pnpm exec vitest run src/mcp/**spec**/investigation.test.ts; confirm failures name the absent investigation implementation.
- [x] Step 3: Implement the read-only evidence collector with named limits and no question-derived SQL, shell, LogQL, or connector commands.
- [x] Step 4: Write failing MCP protocol tests for ask_services, list_projects, and project-scoped ask_project; verify unknown project IDs return an MCP error.
- [x] Step 5: Implement backward-compatible single-project ask_services and registry-backed MCP tools using the project catalog/runtime factory.
- [x] Step 6: Run MCP, investigation, project hub, and config tests plus typecheck; commit the MCP unit.

### Task 5: CLI docs and end-to-end preview

**Files:**

- Modify: README.md
- Modify: package.json
- Modify: skills/resource-inspector/SKILL.md
- Modify: integrations/project-architecture-map/README.md

- [x] Step 1: Add hub and registry-backed MCP package scripts; document startup, project management, modal inspection, natural-language MCP evidence, local/cloud switching, and safe removal.
- [x] Step 2: Run pnpm typecheck, pnpm test, pnpm build, pnpm exec prettier --check ., and git diff --check; fix failures.
- [x] Step 3: Start the hub with a temporary project registry; exercise the project list and add form, inspect a map node and connection settings in the dialog, verify request history, and cover project isolation and MCP questions in protocol tests.
- [x] Step 4: Commit the final documentation and verification changes; report the local URL and registry location.

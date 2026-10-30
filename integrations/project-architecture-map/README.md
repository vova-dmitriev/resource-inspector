# Interactive architecture maps

This repository contains the canonical `project-architecture-map` generator with Resource Inspector support. Keep the generator, its template, and the shipped skill together under `integrations/project-architecture-map/skill`. Do not generate a live map with an older global copy of the skill.

## Install the agent skills

Clone or open this repository, then copy both skills into the cross-runtime agent skills directory:

```sh
RESOURCE_INSPECTOR_DIR="/absolute/path/to/resource-inspector"
mkdir -p "$HOME/.agents/skills/project-architecture-map" "$HOME/.agents/skills/resource-inspector"
cp -R "$RESOURCE_INSPECTOR_DIR/integrations/project-architecture-map/skill/." "$HOME/.agents/skills/project-architecture-map/"
cp -R "$RESOURCE_INSPECTOR_DIR/skills/resource-inspector/." "$HOME/.agents/skills/resource-inspector/"
```

Restart the agent host or refresh its skill list. The map skill traces the target project's source and creates a complete bilingual manifest. The Resource Inspector skill adds live profiles, resource bindings, connector setup, and viewer launch steps. If your host uses a different skills directory, copy the same two `skill` directories there.

Build Resource Inspector once:

```sh
pnpm --dir "$RESOURCE_INSPECTOR_DIR" install --frozen-lockfile
pnpm --dir "$RESOURCE_INSPECTOR_DIR" build
```

## Create and open a live map

1. In the target project, ask the agent to use `project-architecture-map` and `resource-inspector` to inspect the code and create an accurate `architecture-map.json`. Include `resourceProfiles` and `resourceRefsByProfile` on each service or database node that should be clickable. The binding contract is in `$RESOURCE_INSPECTOR_DIR/skills/resource-inspector/references/map-integration.md`.
2. Generate the standalone map with the canonical repo copy:

   ```sh
   node "$RESOURCE_INSPECTOR_DIR/integrations/project-architecture-map/skill/scripts/create-architecture-map.mjs" \
     /absolute/path/to/project/architecture-map.json \
     /absolute/path/to/project/architecture-map.html
   ```

   If you installed the skill, its bundled generator is also valid:

   ```sh
   node "$HOME/.agents/skills/project-architecture-map/scripts/create-architecture-map.mjs" \
     /absolute/path/to/project/architecture-map.json \
     /absolute/path/to/project/architecture-map.html
   ```

3. Create the profile configuration, then set local/cloud resource URLs and connector resource IDs. Put credentials in the project's `.env`; keep secrets out of the map JSON. The viewer reads `.env` defaults and stores any replacement separately.

   ```sh
   mkdir -p /absolute/path/to/project/.resource-inspector
   if [ ! -f /absolute/path/to/project/.resource-inspector/profiles.json ]; then
     cp "$RESOURCE_INSPECTOR_DIR/profiles.example.json" \
       /absolute/path/to/project/.resource-inspector/profiles.json
   fi
   ```
4. Start the viewer with the built CLI:

   ```sh
   node "$RESOURCE_INSPECTOR_DIR/dist/cli.js" map \
     --map /absolute/path/to/project/architecture-map.html \
     --config /absolute/path/to/project/.resource-inspector/profiles.json \
     --env /absolute/path/to/project/.env
   ```

   Open the printed local URL. Click a bound node to inspect status, logs, HTTP request history, tables, rows, or queues. The map profile selector switches local/cloud resources. A `file://` URL displays a static diagram and cannot load live data.

For several projects, configure the Hub and start `node "$RESOURCE_INSPECTOR_DIR/dist/cli.js" hub --projects /absolute/path/to/projects.json`; add each map, profile file, and `.env` path in the Hub UI.

## Troubleshoot an unavailable process

The `http-health` connector treats redirects and non-2xx responses as `unreachable`. Point a process resource at a URL that returns `200` directly, without a redirect. For example, if `http://127.0.0.1:3000/` redirects to `/ru`, configure `http://127.0.0.1:3000/ru`. Confirm the target with `curl -i <health-url>`, then refresh the resource status. A green container status does not guarantee that its HTTP health URL responds.

## Extend the map

The inspector panel is embedded into the generated map template. The manifest declares profiles and maps each clickable node to resource IDs. A node can bind several resources so its status, logs, and request history appear together. Keep each node's bindings scoped to that node and profile.

The sample cloud profile monitors configured HTTP health endpoints, database, queue, and log store; it does not include a cloud container control-plane integration. Configure a remote Docker context or add a provider connector for Kubernetes or managed container platforms.

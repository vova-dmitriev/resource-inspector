---
name: project-architecture-map
description: "Use when someone needs an accurate, interactive map of a software project's runtime flows, services, entities, API endpoints, or data relationships."
---

# Project Architecture Map

## Overview

Build a source-grounded interactive map of real flows, contracts, and entities. Treat geometry as testable behavior; screenshots alone miss broken routing and collisions.

## Inspect the project

1. Read applicable `AGENTS.md` and architecture docs. Use CodeGraph first when available and required.
2. Inventory real entry points: UI routes, API controllers, workers/queues, scheduled jobs, and callbacks.
3. Use OpenAPI for HTTP inventory; confirm dynamic routes in handlers. Read ORM schemas for entities and relationships. Never infer implementation from DTOs or plans.
4. Trace representative flows from user action through API, application/domain layers, adapters, persistence or queues, and response/side effect. Verify each edge in source. Mark external, mocked, or unfinished behavior explicitly.

## Build the map

- Describe the map in JSON, then generate the standalone HTML with the bundled `scripts/create-architecture-map.mjs`. Use [the manifest reference](references/map-manifest.md); do not hand-author the same viewer boilerplate for each project.
- Split major flows into selectable diagrams; add overview, service, or ER views when useful.
- Use directional orthogonal connectors with stable node IDs, explicit source/target IDs, and action labels. Route around text and nodes; model shared buses with explicit junctions. Color must not carry meaning alone.
- Show full endpoint method/path. Synchronize endpoint selection between diagram and list. Details include purpose, parameters, request, response type, complete nested fields/enums, and realistic JSON.
- Keep nested schemas expandable and readable with restrained level colors and indentation. Edge hover highlights its path and connected nodes. Every edge uses a help cursor and immediately shows an accessible, localized process tooltip on hover or keyboard focus. Persist the selected tab in the URL.
- Ship Russian and English from the first map. Put a language switch immediately left of the sun/moon theme button. Translate all interface copy, tab/diagram/node labels, endpoint descriptions, and edge labels/tooltips; preserve technical identifiers, API paths, JSON keys and enum wire values. Keep the selected tab in the URL when switching language. See [translation contract](references/translations.md).
- Keep the standalone viewer self-contained: generate it with the bundled scripts and embed the reusable icons from `assets/icons/`; do not rely on external icon CDNs.
- When the user needs live inspection, declare `resourceProfiles` and add `resourceRefsByProfile` to clickable nodes. Bind each profile to only the resources that represent that node; a frontend node may bind both its health check and log stream. Inspectable nodes open the localized live panel with status, supported views and bounded results, and the profile selector switches between local and cloud resources.
- Live inspection requires serving the generated map through the repository's local resource-inspector viewer. A `file://` map stays static and tells the user to open it through the viewer. Never put connection strings, environment values or tokens in a map manifest. The viewer reads `.env` defaults and accepts write-only replacements in its local connection settings; it saves them outside the map.
- Declare request history as an explicit opt-in capability. Input/output bodies may contain credentials, personal data or payment data; enable capture only after checking the service's redaction rules and retention, keep capture disabled by default, and report body size limits. Never copy raw bodies into the map or artifacts.
- To add a data source, implement a bounded, read-only connector that exposes only named resources and views, register its factory in the inspector, and bind resource IDs in the map manifest. Follow the inspector package's connector-extension instructions when that package is present; verify status, limits, secret handling and failure behavior before showing the source as live.
- Support desktop, tablet, and phone widths; provide a readable alternative when a diagram cannot fit. If the diagram needs horizontal panning, scope it to the diagram figure and mark `data-diagram-overflow="internal-scroll"`; the auditor still rejects page-level overflow.
- Save in the durable visualization directory or requested project path. Derive labels from the inspected repository.

## Validate

1. Add a persistent browser-side geometry auditor. Run every diagram on load and after tab changes, including hidden panels; measure after fonts and layout settle.
2. Check text/node/label bounds and collisions, orthogonal route validity, viewBox bounds, arrow anchors, paths through unrelated nodes, duplicate routes, invalid IDs, and narrow-screen overflow. Apply equivalent rendered-bound checks to non-SVG maps.
3. Exercise tab/hash restore, bidirectional endpoint selection, schema expansion, and edge hover. Report findings with diagram/element IDs; fix unintended collisions and gaps.
4. In a real browser, inspect every diagram at desktop/tablet/phone sizes. Check console, hierarchy, wrapping, contrast, route clarity, and document/container overflow. Geometry tests supplement, not replace, visual review.

Create a source-grounded manifest using [the map manifest contract](references/map-manifest.md). Generate required `ru`/`en` translation slots with `node ~/.codex/skills/project-architecture-map/scripts/create-translation-skeleton.mjs <map.json> <map-with-translation-slots.json>`, fill every slot using [the translation contract](references/translations.md), then run `node ~/.codex/skills/project-architecture-map/scripts/create-architecture-map.mjs <map.json> <output.html>`. The generator validates all `ru`/`en` labels, descriptions and tooltips, embeds the sun/moon SVG assets, and emits a standalone HTML file. For SVG maps, run the bundled Playwright auditor from a project with `@playwright/test`: `node ~/.codex/skills/project-architecture-map/scripts/audit-architecture-map.mjs <url-or-html-file>`. Read [the geometry-audit reference](references/geometry-audit.md) for the markup contract and findings.

## Common mistakes

| Mistake | Correction |
|---|---|
| One giant diagram | Split by flow and provide navigation. |
| Only the default tab is checked | Audit and inspect every diagram. |
| SVG fits, so labels fit | Measure rendered text against nodes, routes, and viewport. |
| Routes look connected | Verify declared anchors and orthogonal segments against obstacles. |
| JSON uses `...` or empty meaningful arrays | Include representative nested objects, enums, and collection items from actual schemas. |
| Plans or mocks appear as live behavior | Verify source and label their status. |

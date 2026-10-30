# Diagram Geometry Audit

Use this reference to add a repeatable browser-side auditor to an interactive architecture map. The exact markup can vary; the contract should not.

Run the bundled check from the project directory, where `@playwright/test` and its Chromium browser are installed:

```bash
node "$HOME/.agents/skills/project-architecture-map/scripts/audit-architecture-map.mjs" http://127.0.0.1:3000/architecture
node "$HOME/.agents/skills/project-architecture-map/scripts/audit-architecture-map.mjs" ./architecture.html --widths=1440,768,390
```

The command returns structured JSON and exits nonzero when it finds a geometry or browser-console error. Default SVG selectors are `svg.diagram`, `.node`, `path.edge`, `.edge-label`, and `path.bus`; keep these classes on map elements so the script can be reused without rewriting its checks. It uses 1440, 768, and 390 CSS-pixel viewports by default. It audits rendered geometry, not semantic click/hover behavior; exercise those interactions separately.

## Give the auditor stable geometry

Represent each diagram as a graph with stable IDs:

- Node groups expose a node ID and contain the visible shape and its text.
- Each connector exposes its own ID, source ID, target ID, and rendered route. Use explicit junction IDs when a connector attaches to a bus rather than directly to a node.
- Edge labels have IDs and are associated with the connector they describe.
- Each diagram panel has a stable diagram ID, including panels initially hidden behind tabs.

Keep endpoints explicit in metadata instead of guessing connectivity from visual proximity. The auditor should report missing IDs, references to nonexistent nodes/junctions, and duplicate connector IDs.

## Measure the rendered diagram

Run after the browser has applied fonts and layout. To inspect hidden tabs, temporarily make their panels measurable without showing them to the user, audit them, and restore their original state in `finally` cleanup. Never leave a tab visible or change the selected hash as a side effect of an audit.

For every diagram:

1. Measure rendered node, text, label, and SVG bounds. Check visible node text and labels stay inside their intended boxes and the SVG viewBox/container. Include text length and wrapping; a shape fitting does not mean its label fits.
2. Check node interiors do not overlap. Check labels against unrelated node interiors, other labels, and route segments. A label may overlap its own connector only when the design explicitly reserves and visually clears a label area.
3. Validate each connector route. For SVG, accept only orthogonal segments (`M`, `H`, `V`, including relative forms if supported); reject malformed paths and diagonal/curved segments. Confirm all route points and arrowheads stay inside the viewBox.
4. Resolve each source/target ID and confirm the route's first/last point meets the declared node boundary within a small documented rendering tolerance. A bus endpoint must meet its explicit junction; do not excuse an arbitrary gap as a bus.
5. Test each route segment against node interiors. It may touch its declared endpoints and declared junctions, but must not pass through an unrelated node. Check route-route crossings where they obscure direction or imply a false connection; report them for review even if a crossing is intentional.
6. Normalize equivalent route geometry and report duplicate edges. For non-SVG renderers, apply these checks to their rendered node and connector bounds rather than skipping the audit.

For SVG bounds, transform browser client rectangles back into the SVG coordinate system with `getScreenCTM().inverse()` before comparing against the viewBox. For orthogonal line-vs-rectangle intersection, test each horizontal or vertical segment against the rectangle interior; boundary contact is distinct from entering the interior. Keep the tolerance named and small enough that it cannot hide a visible gap.

## Run and report the audit

Expose one audit entry point that visits every diagram, not only the currently selected one. Run it at initial render and after tab content/layout changes. Return structured findings such as `{ diagramId, elementId, rule, message }`; log a concise summary and make failures available to browser automation. Never silently discard findings.

Also check the document and each intended diagram container for horizontal overflow at phone width. Diagram zoom/pan may be intentional inside a canvas, but it must not create an accidental second page scrollbar or clip the diagram's controls. When an intentionally wide diagram uses an internally scrollable figure, mark that figure with `data-diagram-overflow="internal-scroll"`; the auditor permits only that declared inner overflow and still fails document-level horizontal overflow.

## Keep geometry tests separate from visual review

Automate route anchors, collisions, bounds, IDs, overflow, tab restoration, endpoint synchronization, expandable response fields, and hover highlighting. Then use a real browser to inspect every diagram at the project's phone, tablet, and desktop widths in light/dark themes where applicable. Review legibility, text wrapping, edge direction, contrast, and whether nearby routes remain understandable. A clean geometry report is necessary, not sufficient.

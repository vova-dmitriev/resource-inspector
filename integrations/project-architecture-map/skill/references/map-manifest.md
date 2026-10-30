# Architecture map manifest

The generator accepts one JSON file and writes one standalone HTML file:

```bash
node "$HOME/.agents/skills/project-architecture-map/scripts/create-architecture-map.mjs" ./architecture-map.json ./architecture-map.html
```

Core fields are `title`, `tabs`, and `endpoints`; generated maps also require `i18n` and complete `translations.ru/en`. Use `scripts/create-translation-skeleton.mjs` to create every required translation slot. See [the translation contract](translations.md). Each tab contains `id`, `title`, optional `endpointIds`, and `diagrams`. Each diagram declares its `id`, accessible `title`, SVG `viewBox`, nodes, and routed edges. Every edge includes explicit `labelX`/`labelY`; place text away from nodes and other routes. Coordinates and routes are in viewBox units. Use orthogonal SVG path commands (`M`, `H`, `V`) and keep route endpoints on the declared nodes.

```json
{
  "title": "Example platform",
  "i18n": { "defaultLocale": "ru" },
  "translations": { "ru": {}, "en": {} },
  "tabs": [
    {
      "id": "booking",
      "title": "Booking",
      "endpointIds": ["create-order"],
      "diagrams": [
        {
          "id": "booking-flow",
          "title": "Quote to order",
          "viewBox": "0 0 640 220",
          "nodes": [
            { "id": "quote", "kind": "entity", "x": 20, "y": 70, "width": 170, "height": 60, "title": "Quote", "subtitle": "search_quotes" },
            { "id": "api", "kind": "api", "x": 430, "y": 70, "width": 180, "height": 60, "title": "Create order", "subtitle": "POST /api/v1/orders", "endpointIds": ["create-order"] }
          ],
          "edges": [
            { "id": "quote-to-order", "from": "quote", "to": "api", "path": "M190 100 H430", "label": "selected quote", "labelX": 310, "labelY": 88 }
          ]
        }
      ]
    }
  ],
  "endpoints": [
    {
      "id": "create-order",
      "method": "POST",
      "path": "/api/v1/orders",
      "description": "Creates an order from a saved checkout draft.",
      "parameters": { "headers": ["idempotency-key"] },
      "request": { "draftId": "draft-01" },
      "responseType": "OrderDto",
      "responseExample": { "id": "order-01", "status": "pending_reservation" },
      "responseSchema": {
        "type": "object",
        "required": ["id", "status"],
        "properties": {
          "id": { "type": "string" },
          "status": { "type": "string", "enum": ["pending_reservation", "action_required", "fulfilled", "expired"] }
        }
      }
    }
  ]
}
```

The short `translations` object in this excerpt is only a structural placeholder; use `create-translation-skeleton.mjs` and fill every required value before generation. See `templates/architecture-map.example.json` for a complete runnable sample. Node kinds are `api`, `service`, `entity`, and `external`. Endpoint objects may include `parameters`, `request`, `responseType`, `responseExample`, and a nested `responseSchema`; the generator renders these as formatted JSON and expandable fields. Connect each endpoint to its diagram nodes with `endpointIds`.

The generator validates duplicate IDs, missing endpoints, positive node sizes, explicit edge-label coordinates, and edge references before writing output. Then run the geometry auditor and inspect the page in a browser at desktop, tablet, and phone widths.

## Live resource inspection

Live inspection is optional. Declare profiles once at the manifest root, then bind each inspectable node to resource IDs for each profile:

```json
{
  "resourceProfiles": [
    { "id": "local", "name": "Local development", "kind": "local" },
    { "id": "cloud-staging", "name": "Cloud staging", "kind": "cloud" }
  ],
  "tabs": [{
    "diagrams": [{
      "nodes": [{
        "id": "api",
        "resourceRefsByProfile": {
          "local": ["api-process", "backend-logs"],
          "cloud-staging": ["api-health-staging", "backend-logs-staging"]
        }
      }]
    }]
  }]
}
```

`kind` must be `local` or `cloud`; profile IDs must be unique. Resource IDs are opaque IDs declared in the inspector configuration. Bind one node to multiple resources when status and logs come from different connectors. The map shows only bindings for the selected profile. The local viewer validates every requested profile/resource against its configured connectors.

The generated map never embeds connection data. Serve it with `pnpm resource-inspector -- map --map <generated-map.html> --config .resource-inspector/profiles.json --env .env`. Opening the same HTML through `file://` leaves its diagrams usable but disables live requests. Profile and connection settings are local to the viewer; secret values are write-only and saved outside the map.

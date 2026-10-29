import { describe, expect, it } from "vitest"
import { injectInspectorBasePath } from "../map-access.js"

describe("injectInspectorBasePath", () => {
  it("inserts an escaped project API prefix into a generated map head", () => {
    const result = injectInspectorBasePath("<!doctype html><html><head></head><body>map</body></html>", "/projects/tickets")

    expect(result).toContain('<meta name="resource-inspector-base-path" content="/projects/tickets">')
    expect(result).toContain("<body>map</body>")
  })

  it("rejects a generated map without a head instead of serving a map with unscoped requests", () => {
    expect(() => injectInspectorBasePath("<div>map</div>", "/projects/tickets")).toThrow("Generated map head is missing")
  })
})

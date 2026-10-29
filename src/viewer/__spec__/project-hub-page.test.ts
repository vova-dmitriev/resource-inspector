import { describe, expect, it } from "vitest"
import { renderProjectHubPage } from "../project-hub-page.js"

describe("renderProjectHubPage", () => {
  it("renders project links and the add/edit form without exposing filesystem paths", () => {
    const html = renderProjectHubPage([{ id: "tickets", name: "Tickets" }])

    expect(html).toContain('href="/projects/tickets/"')
    expect(html).toContain('id="project-form"')
    expect(html).toContain('name="mapPath"')
    expect(html).toContain('name="configPath"')
    expect(html).toContain('name="envPath"')
    expect(html).not.toContain("/Users/")
  })

  it("escapes project names before placing them into map-manager markup", () => {
    const html = renderProjectHubPage([{ id: "tickets", name: '<img src=x onerror="alert(1)">' }])

    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")
    expect(html).not.toContain('<img src=x onerror="alert(1)">')
  })
})

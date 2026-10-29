#!/usr/bin/env node

import { createRequire } from "node:module"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const DefaultViewports = [1440, 768, 390]
const DefaultTolerance = 5
const BrowserHeight = 1000
const PageLoadTimeoutMs = 30_000
const DiagramSelector = "svg.diagram"
const NodeSelector = ".node"
const EdgeSelector = "path.edge"
const LabelSelector = ".edge-label"

const [targetArgument, ...optionArguments] = process.argv.slice(2)

if (!targetArgument || optionArguments.includes("--help")) {
  console.log("Usage: node scripts/audit-architecture-map.mjs <url-or-html-file> [--widths=1440,768,390]")
  process.exit(targetArgument ? 0 : 2)
}

const viewportArgument = optionArguments.find((argument) => argument.startsWith("--widths="))
const viewports = viewportArgument
  ? viewportArgument.slice("--widths=".length).split(",").map(Number).filter((width) => Number.isFinite(width) && width > 0)
  : DefaultViewports

if (!viewports.length) throw new Error("At least one positive viewport width is required")

const targetUrl = toUrl(targetArgument)
const requireFromProject = createRequire(resolve(process.cwd(), "package.json"))
const { chromium } = requireFromProject("@playwright/test")
const browser = await chromium.launch({ headless: true })
const findings = []

try {
  const page = await browser.newPage({ viewport: { width: viewports[0], height: BrowserHeight } })
  const pageErrors = []

  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text())
  })

  await page.goto(targetUrl, { waitUntil: "networkidle", timeout: PageLoadTimeoutMs })
  await page.evaluate(() => document.fonts?.ready)

  for (const width of viewports) {
    await page.setViewportSize({ width, height: BrowserHeight })
    await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))))

    const viewportFindings = await page.evaluate(
      ({ diagramSelector, nodeSelector, edgeSelector, labelSelector, tolerance }) => {
        const issues = []
        const diagramElements = [...document.querySelectorAll(diagramSelector)]
        const report = (diagramId, elementId, rule, message) => issues.push({ width: innerWidth, diagramId, elementId, rule, message })

        const rectFor = (element, svg) => {
          const box = element.getBBox()
          const elementMatrix = element.getScreenCTM()
          const svgMatrix = svg.getScreenCTM()

          if (!elementMatrix || !svgMatrix) return null

          const toSvg = svgMatrix.inverse()
          const corners = [
            [box.x, box.y],
            [box.x + box.width, box.y],
            [box.x, box.y + box.height],
            [box.x + box.width, box.y + box.height],
          ].map(([x, y]) => {
            const screenPoint = new DOMPoint(x, y).matrixTransform(elementMatrix)
            return screenPoint.matrixTransform(toSvg)
          })
          const xs = corners.map((point) => point.x)
          const ys = corners.map((point) => point.y)

          return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
        }

        const overlaps = (first, second, padding = 0) =>
          first.left < second.right - padding &&
          first.right > second.left + padding &&
          first.top < second.bottom - padding &&
          first.bottom > second.top + padding

        const parseRoute = (path, diagramId) => {
          const source = path.getAttribute("d") ?? ""
          const tokens = source.match(/[a-zA-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? []
          const segments = []
          let command = ""
          let x = 0
          let y = 0
          let index = 0
          let malformed = false

          const readNumber = () => {
            const value = Number(tokens[index])
            index += 1
            return value
          }

          while (index < tokens.length) {
            if (/^[a-z]$/i.test(tokens[index])) command = tokens[index++]
            if (!command) {
              malformed = true
              break
            }

            const relative = command === command.toLowerCase()
            const operation = command.toUpperCase()
            const previous = { x, y }

            if (operation === "M" || operation === "L") {
              if (index + 1 >= tokens.length || /^[a-z]$/i.test(tokens[index]) || /^[a-z]$/i.test(tokens[index + 1])) {
                malformed = true
                break
              }
              x = readNumber() + (relative ? x : 0)
              y = readNumber() + (relative ? y : 0)
            } else if (operation === "H") {
              if (index >= tokens.length || /^[a-z]$/i.test(tokens[index])) {
                malformed = true
                break
              }
              x = readNumber() + (relative ? x : 0)
            } else if (operation === "V") {
              if (index >= tokens.length || /^[a-z]$/i.test(tokens[index])) {
                malformed = true
                break
              }
              y = readNumber() + (relative ? y : 0)
            } else {
              report(diagramId, path.id || "edge", "unsupported-route-command", `SVG route command ${command} is not orthogonal`)
              return null
            }

            if (operation !== "M") {
              if (previous.x !== x && previous.y !== y) report(diagramId, path.id || "edge", "diagonal-route", "Connector contains a diagonal segment")
              segments.push({ from: previous, to: { x, y } })
            }
            if (operation === "M") command = relative ? "l" : "L"
          }

          if (malformed || segments.length === 0) {
            report(diagramId, path.id || "edge", "malformed-route", "Connector path is empty or malformed")
            return null
          }

          return { segments, start: segments[0].from, end: segments.at(-1).to }
        }

        const distanceToBoundary = (point, box) => {
          const dx = Math.max(box.left - point.x, 0, point.x - box.right)
          const dy = Math.max(box.top - point.y, 0, point.y - box.bottom)
          return Math.hypot(dx, dy)
        }

        const pointInsideInterior = (point, box, inset = 1) =>
          point.x > box.left + inset && point.x < box.right - inset && point.y > box.top + inset && point.y < box.bottom - inset

        const distanceToSegment = (point, segment) => {
          const deltaX = segment.to.x - segment.from.x
          const deltaY = segment.to.y - segment.from.y
          const lengthSquared = deltaX * deltaX + deltaY * deltaY
          const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - segment.from.x) * deltaX + (point.y - segment.from.y) * deltaY) / lengthSquared))
          return Math.hypot(point.x - (segment.from.x + ratio * deltaX), point.y - (segment.from.y + ratio * deltaY))
        }

        const intersectionOf = (first, second) => {
          const firstHorizontal = first.from.y === first.to.y
          const secondHorizontal = second.from.y === second.to.y

          if (firstHorizontal && secondHorizontal) {
            return null
          }
          if (!firstHorizontal && !secondHorizontal) {
            return null
          }

          const horizontal = firstHorizontal ? first : second
          const vertical = firstHorizontal ? second : first
          const point = { x: vertical.from.x, y: horizontal.from.y }
          const within = (value, start, end) => value >= Math.min(start, end) - 1 && value <= Math.max(start, end) + 1
          return within(point.x, horizontal.from.x, horizontal.to.x) && within(point.y, vertical.from.y, vertical.to.y) ? point : null
        }

        const segmentCrossesInterior = (segment, box) => {
          if (segment.from.y === segment.to.y) {
            const y = segment.from.y
            const left = Math.min(segment.from.x, segment.to.x)
            const right = Math.max(segment.from.x, segment.to.x)
            return y > box.top + 1 && y < box.bottom - 1 && left < box.right - 1 && right > box.left + 1
          }
          const x = segment.from.x
          const top = Math.min(segment.from.y, segment.to.y)
          const bottom = Math.max(segment.from.y, segment.to.y)
          return x > box.left + 1 && x < box.right - 1 && top < box.bottom - 1 && bottom > box.top + 1
        }

        const auditDiagram = (svg) => {
          const diagramId = svg.id || svg.getAttribute("aria-labelledby") || `diagram-${diagramElements.indexOf(svg) + 1}`
          const viewBox = svg.viewBox.baseVal
          const view = { left: viewBox.x, top: viewBox.y, right: viewBox.x + viewBox.width, bottom: viewBox.y + viewBox.height }
          const nodes = [...svg.querySelectorAll(nodeSelector)].map((element, index) => ({
            element,
            id: element.dataset.nodeId || element.id || `node-${index + 1}`,
            box: rectFor(element, svg),
          }))
          const labels = [...svg.querySelectorAll(labelSelector)].map((element, index) => ({
            element,
            id: element.id || `label-${index + 1}`,
            edgeId: element.dataset.edgeId,
            box: rectFor(element, svg),
          }))
          const routes = [...svg.querySelectorAll(edgeSelector)].map((element, index) => ({
            element,
            id: element.dataset.edgeId || element.id || `edge-${index + 1}`,
            route: parseRoute(element, diagramId),
          }))
          const busSegments = [...svg.querySelectorAll("path.bus")].flatMap((element) => parseRoute(element, diagramId)?.segments ?? [])

          if (!Number.isFinite(view.right) || !Number.isFinite(view.bottom) || viewBox.width <= 0 || viewBox.height <= 0) {
            report(diagramId, svg.id || "svg", "invalid-viewbox", "Diagram has no valid SVG viewBox")
            return
          }

          nodes.forEach((node) => {
            if (!node.box) return
            if (node.box.left < view.left || node.box.top < view.top || node.box.right > view.right || node.box.bottom > view.bottom) {
              report(diagramId, node.id, "node-outside-viewbox", "Node bounds exceed the diagram viewBox")
            }
            const background = node.element.querySelector("rect, ellipse, polygon")
            const shape = background ? rectFor(background, svg) : node.box
            for (const text of node.element.querySelectorAll("text")) {
              const textBox = rectFor(text, svg)
              if (textBox && shape && (textBox.left < shape.left - 1 || textBox.top < shape.top - 1 || textBox.right > shape.right + 1 || textBox.bottom > shape.bottom + 1)) {
                report(diagramId, node.id, "node-text-overflow", `Text '${text.textContent.trim()}' exceeds its node bounds`)
              }
            }
          })

          for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
            for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
              if (nodes[firstIndex].box && nodes[secondIndex].box && overlaps(nodes[firstIndex].box, nodes[secondIndex].box, 1)) {
                report(diagramId, `${nodes[firstIndex].id},${nodes[secondIndex].id}`, "overlapping-nodes", "Node bounds overlap")
              }
            }
          }

          const normalizedRoutes = new Map()
          for (const item of routes) {
            if (!item.route) continue
            const signature = item.route.segments.map(({ from, to }) => `${from.x},${from.y}:${to.x},${to.y}`).join("|")
            if (normalizedRoutes.has(signature)) report(diagramId, item.id, "duplicate-route", `Duplicates connector ${normalizedRoutes.get(signature)}`)
            else normalizedRoutes.set(signature, item.id)

            for (const point of [item.route.start, item.route.end]) {
              if (point.x < view.left || point.x > view.right || point.y < view.top || point.y > view.bottom) {
                report(diagramId, item.id, "route-outside-viewbox", "Connector endpoint exceeds the diagram viewBox")
              }
            }

            const sourceId = item.element.dataset.from || item.element.dataset.source
            const targetId = item.element.dataset.to || item.element.dataset.target
            const endpointPairs = [
              [item.route.start, sourceId],
              [item.route.end, targetId],
            ]
            for (const [point, declaredId] of endpointPairs) {
              const candidates = declaredId ? nodes.filter((node) => node.id === declaredId) : nodes
              if (declaredId && candidates.length === 0) {
                report(diagramId, item.id, "missing-endpoint-node", `Connector references unknown node '${declaredId}'`)
                continue
              }
              const nearest = Math.min(...candidates.map((node) => node.box ? distanceToBoundary(point, node.box) : Infinity))
              const touchesBus = busSegments.some((segment) => distanceToSegment(point, segment) <= tolerance)
              if (nearest > tolerance && !touchesBus) report(diagramId, item.id, "unanchored-endpoint", `Connector endpoint is ${nearest.toFixed(1)} units from its declared node boundary or bus`)
            }

            const source = item.element.dataset.from || item.element.dataset.source
            const target = item.element.dataset.to || item.element.dataset.target
            for (const node of nodes) {
              if (node.id === source || node.id === target) continue
              if (item.route.segments.some((segment) => segmentCrossesInterior(segment, node.box))) {
                report(diagramId, item.id, "route-through-node", `Connector crosses unrelated node '${node.id}'`)
              }
            }
          }

          for (let firstIndex = 0; firstIndex < routes.length; firstIndex += 1) {
            for (let secondIndex = firstIndex + 1; secondIndex < routes.length; secondIndex += 1) {
              const first = routes[firstIndex]
              const second = routes[secondIndex]
              if (!first.route || !second.route) continue
              const crossings = []
              for (const firstSegment of first.route.segments) {
                for (const secondSegment of second.route.segments) {
                  const point = intersectionOf(firstSegment, secondSegment)
                  if (!point) continue
                  const atEndpoint = [first.route.start, first.route.end, second.route.start, second.route.end].some(
                    (endpoint) => Math.hypot(endpoint.x - point.x, endpoint.y - point.y) <= 1,
                  )
                  const onNode = nodes.some((node) => node.box && pointInsideInterior(point, node.box, 0))
                  const onBus = busSegments.some((segment) => distanceToSegment(point, segment) <= 1)
                  if (!atEndpoint && !onNode && !onBus) crossings.push(point)
                }
              }
              if (crossings.length) {
                const locations = crossings.map((point) => `(${point.x}, ${point.y})`).join(", ")
                report(diagramId, `${first.id},${second.id}`, "crossing-routes", `Connectors intersect at ${locations} outside a node or declared bus`)
              }
            }
          }

          for (let firstIndex = 0; firstIndex < labels.length; firstIndex += 1) {
            const label = labels[firstIndex]
            if (!label.box) continue
            if (label.box.left < view.left || label.box.top < view.top || label.box.right > view.right || label.box.bottom > view.bottom) {
              report(diagramId, label.id, "label-outside-viewbox", "Connector label exceeds the diagram viewBox")
            }
            if (nodes.some((node) => node.box && overlaps(label.box, node.box, 1))) {
              report(diagramId, label.id, "label-over-node", "Connector label overlaps a node")
            }
            if (labels.slice(firstIndex + 1).some((other) => other.box && overlaps(label.box, other.box, 1))) {
              report(diagramId, label.id, "overlapping-labels", "Connector label overlaps another label")
            }
            for (const route of routes) {
              if (!route.route || (label.edgeId && route.id === label.edgeId)) continue
              if (route.route.segments.some((segment) => segmentCrossesInterior(segment, label.box))) {
                report(diagramId, label.id, "label-over-route", `Connector label overlaps route '${route.id}'`)
              }
            }
          }
        }

        try {
          for (const svg of diagramElements) {
            const hiddenAncestors = []
            for (let ancestor = svg; ancestor; ancestor = ancestor.parentElement) {
              if (ancestor.hidden) {
                hiddenAncestors.push({ element: ancestor, hidden: ancestor.hidden })
                ancestor.hidden = false
              }
            }

            try {
              if (svg.getClientRects().length > 0) auditDiagram(svg)
              const container = svg.parentElement
              const containerOverflow = container.scrollWidth - container.clientWidth
              const allowsInternalScroll = container.dataset.diagramOverflow === "internal-scroll"
              if (containerOverflow > 1 && !allowsInternalScroll) {
                report(svg.id || "diagram", "container", "diagram-overflow", `Diagram container overflows by ${containerOverflow}px`)
              }
              const pageOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth
              if (pageOverflow > 1) report(svg.id || "diagram", "document", "horizontal-overflow", `Document overflows viewport by ${pageOverflow}px`)
            } finally {
              for (const state of hiddenAncestors) state.element.hidden = state.hidden
            }
          }
          if (diagramElements.length === 0) report("page", "document", "no-diagrams", `No diagrams matched '${diagramSelector}'`)
        } catch (error) {
          report("page", "document", "audit-exception", error instanceof Error ? error.message : String(error))
        }

        return issues
      },
      { diagramSelector: DiagramSelector, nodeSelector: NodeSelector, edgeSelector: EdgeSelector, labelSelector: LabelSelector, tolerance: DefaultTolerance },
    )
    findings.push(...viewportFindings)
  }

  if (pageErrors.length) findings.push(...pageErrors.map((message) => ({ rule: "browser-console-error", message })))
} finally {
  await browser.close()
}

console.log(JSON.stringify({ target: targetUrl, viewports, findingCount: findings.length, findings }, null, 2))
if (findings.length) process.exitCode = 1

function toUrl(value) {
  if (/^https?:\/\//.test(value) || value.startsWith("file://")) return value
  return pathToFileURL(resolve(value)).href
}

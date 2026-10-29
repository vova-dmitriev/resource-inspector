#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const [manifestArgument, outputArgument] = process.argv.slice(2)
const skillDirectory = dirname(dirname(fileURLToPath(import.meta.url)))

if (process.argv.includes("--help")) {
  console.log("Usage: node scripts/create-architecture-map.mjs <map.json> <output.html>")
  process.exit(0)
}

if (!manifestArgument || !outputArgument) {
  console.error("Usage: node scripts/create-architecture-map.mjs <map.json> <output.html>")
  process.exit(2)
}

const manifestPath = resolve(manifestArgument)
const outputPath = resolve(outputArgument)
const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
validateManifest(manifest)

const template = await readFile(resolve(skillDirectory, "templates/architecture-map.html"), "utf8")
const sunIcon = await readFile(resolve(skillDirectory, "assets/icons/sun.svg"), "utf8")
const moonIcon = await readFile(resolve(skillDirectory, "assets/icons/moon.svg"), "utf8")
const serializedManifest = JSON.stringify(manifest).replaceAll("<", "\\u003c")
const html = template
  .replaceAll("__TITLE__", escapeHtml(manifest.title))
  .replace("__MAP_DATA__", serializedManifest)
  .replace("__SUN_ICON__", JSON.stringify(sunIcon))
  .replace("__MOON_ICON__", JSON.stringify(moonIcon))

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, html)
console.log("Created architecture map: " + outputPath)

function validateManifest(value) {
  if (!value || typeof value.title !== "string" || !Array.isArray(value.tabs) || !Array.isArray(value.endpoints)) {
    throw new Error("Manifest requires title, tabs[], and endpoints[]")
  }
  validateTranslations(value)

  const resourceProfileIds = new Set()
  for (const profile of value.resourceProfiles ?? []) {
    if (!isNonEmptyString(profile.id) || !isNonEmptyString(profile.name) || !["local", "cloud"].includes(profile.kind)) {
      throw new Error("Each resource profile requires non-empty id/name and local/cloud kind")
    }
    if (resourceProfileIds.has(profile.id)) throw new Error("Duplicate resource profile ID: " + profile.id)
    resourceProfileIds.add(profile.id)
  }

  const endpointIds = new Set()
  for (const endpoint of value.endpoints) {
    if (!isNonEmptyString(endpoint.id) || !isNonEmptyString(endpoint.method) || !isNonEmptyString(endpoint.path)) {
      throw new Error("Each endpoint requires non-empty id, method, and path")
    }
    if (endpointIds.has(endpoint.id)) throw new Error("Duplicate endpoint ID: " + endpoint.id)
    endpointIds.add(endpoint.id)
  }

  const diagramIds = new Set()
  for (const tab of value.tabs) {
    if (!isNonEmptyString(tab.id) || !isNonEmptyString(tab.title) || !Array.isArray(tab.diagrams)) {
      throw new Error("Each tab requires non-empty id/title and diagrams[]")
    }
    for (const endpointId of tab.endpointIds ?? []) assertEndpoint(endpointId, endpointIds)

    for (const diagram of tab.diagrams) {
      if (!isNonEmptyString(diagram.id) || !isNonEmptyString(diagram.title) || !isNonEmptyString(diagram.viewBox)) {
        throw new Error("Each diagram requires non-empty id, title, and viewBox")
      }
      if (!Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) throw new Error("Each diagram requires nodes[] and edges[]")
      if (diagramIds.has(diagram.id)) throw new Error("Duplicate diagram ID: " + diagram.id)
      diagramIds.add(diagram.id)

      const nodeIds = new Set()
      for (const node of diagram.nodes) {
        if (!isNonEmptyString(node.id) || !isNonEmptyString(node.title)) throw new Error("Each node requires non-empty id and title")
        if (![node.x, node.y, node.width, node.height].every(Number.isFinite)) {
          throw new Error("Each node requires finite x/y/width/height in " + diagram.id)
        }
        if (node.width <= 0 || node.height <= 0) throw new Error("Node dimensions must be positive in " + diagram.id)
        if (nodeIds.has(node.id)) throw new Error("Duplicate node ID: " + node.id)
        nodeIds.add(node.id)
        for (const endpointId of node.endpointIds ?? []) assertEndpoint(endpointId, endpointIds)
        for (const [profileId, resourceIds] of Object.entries(node.resourceRefsByProfile ?? {})) {
          if (!resourceProfileIds.has(profileId)) throw new Error("Unknown resource profile ID: " + profileId)
          if (!Array.isArray(resourceIds) || resourceIds.some((resourceId) => !isNonEmptyString(resourceId))) {
            throw new Error("Resource bindings must contain non-empty IDs: " + node.id)
          }
          if (new Set(resourceIds).size !== resourceIds.length) throw new Error("Duplicate resource binding: " + node.id)
        }
      }

      for (const edge of diagram.edges) {
        if (!isNonEmptyString(edge.id) || !isNonEmptyString(edge.from) || !isNonEmptyString(edge.to)) {
          throw new Error("Each edge requires non-empty id/from/to in " + diagram.id)
        }
        if (!isNonEmptyString(edge.path) || !isNonEmptyString(edge.label)) throw new Error("Each edge requires path and label in " + diagram.id)
        if (!Number.isFinite(edge.labelX) || !Number.isFinite(edge.labelY)) {
          throw new Error("Each edge label requires finite labelX/labelY in " + diagram.id)
        }
        if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) throw new Error("Edge references an unknown node: " + edge.id)
      }
    }
  }
}

function assertEndpoint(id, endpointIds) {
  if (!endpointIds.has(id)) throw new Error("Unknown endpoint ID: " + id)
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function validateTranslations(manifest) {
  const locales = ["ru", "en"]
  const uiKeys = ["sectionsLabel", "switchLanguage", "switchToLightTheme", "switchToDarkTheme", "required", "response", "unknownResponse", "parameters", "noParameters", "request", "noRequestBody", "responseExample", "responseFields", "resourceProfile", "resourceSettings", "resourceClose", "resourceInspectorStatic", "resourceNoBinding", "resourceMissing", "resourceLoading", "resourceRefresh", "resourceView", "resourceFailed", "resourceSettingsTitle", "resourceSettingsHelp", "resourceConfigured", "resourceNotConfigured", "resourceSave", "resourceSaved", "resourceRunning", "resourceStarting", "resourceStopped", "resourceDegraded", "resourceUnreachable", "resourceUnknown"]
  if (!manifest.translations || !locales.includes(manifest.i18n?.defaultLocale)) {
    throw new Error('Manifest requires i18n.defaultLocale ("ru" or "en") and translations.ru/en')
  }

  for (const locale of locales) {
    const translation = manifest.translations[locale]
    if (!translation || !translation.ui || !translation.tabs || !translation.diagrams || !translation.nodes || !translation.edges || !translation.endpoints) {
      throw new Error(`Translations for ${locale} require ui, tabs, diagrams, nodes, edges, and endpoints`)
    }
    requireTranslation(translation.page?.title, locale, "page title")
    for (const key of uiKeys) requireTranslation(translation.ui[key], locale, `UI label ${key}`)
    for (const tab of manifest.tabs) requireTranslation(translation.tabs[tab.id]?.title, locale, `tab ${tab.id}`)
    for (const tab of manifest.tabs) {
      for (const diagram of tab.diagrams) {
        requireTranslation(translation.diagrams[diagram.id]?.title, locale, `diagram ${diagram.id}`)
        for (const node of diagram.nodes) {
          requireTranslation(translation.nodes[`${diagram.id}:${node.id}`]?.title, locale, `node ${node.id}`)
          if (node.subtitle) requireTranslation(translation.nodes[`${diagram.id}:${node.id}`]?.subtitle, locale, `node subtitle ${node.id}`)
        }
        for (const edge of diagram.edges) {
          const edgeTranslation = translation.edges[`${diagram.id}:${edge.id}`]
          requireTranslation(edgeTranslation?.label, locale, `edge label ${diagram.id}:${edge.id}`)
          requireTranslation(edgeTranslation?.tooltip, locale, `edge tooltip ${diagram.id}:${edge.id}`)
        }
      }
    }
    for (const endpoint of manifest.endpoints) {
      if (endpoint.description) requireTranslation(translation.endpoints[endpoint.id]?.description, locale, `endpoint ${endpoint.id}`)
    }
  }
}

function requireTranslation(value, locale, subject) {
  if (!isNonEmptyString(value)) throw new Error(`Missing ${locale} translation for ${subject}`)
}

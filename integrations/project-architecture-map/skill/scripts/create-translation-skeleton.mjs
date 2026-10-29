#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const [inputArgument, outputArgument] = process.argv.slice(2)

if (process.argv.includes("--help") || !inputArgument || !outputArgument) {
  console.log("Usage: node scripts/create-translation-skeleton.mjs <map.json> <map-with-translation-slots.json>")
  process.exit(process.argv.includes("--help") ? 0 : 2)
}

const inputPath = resolve(inputArgument)
const outputPath = resolve(outputArgument)
const manifest = JSON.parse(await readFile(inputPath, "utf8"))

if (!manifest || typeof manifest.title !== "string" || !Array.isArray(manifest.tabs) || !Array.isArray(manifest.endpoints)) {
  throw new Error("Manifest requires title, tabs[], and endpoints[]")
}

const uiKeys = [
  "sectionsLabel", "switchLanguage", "switchToLightTheme", "switchToDarkTheme", "required", "response", "unknownResponse",
  "parameters", "noParameters", "request", "noRequestBody", "responseExample", "responseFields",
  "resourceProfile", "resourceSettings", "resourceClose", "resourceInspectorStatic", "resourceNoBinding", "resourceMissing",
  "resourceLoading", "resourceRefresh", "resourceView", "resourceFailed", "resourceSettingsTitle", "resourceSettingsHelp",
  "resourceConfigured", "resourceNotConfigured", "resourceSave", "resourceSaved", "resourceRunning", "resourceStarting",
  "resourceStopped", "resourceDegraded", "resourceUnreachable", "resourceUnknown",
]
const translations = { ru: makeLocale("ru"), en: makeLocale("en") }

function makeLocale() {
  const locale = { page: { title: "" }, ui: Object.fromEntries(uiKeys.map((key) => [key, ""])), tabs: {}, diagrams: {}, nodes: {}, edges: {}, endpoints: {} }

  for (const tab of manifest.tabs) {
    locale.tabs[tab.id] = { title: "" }
    for (const diagram of tab.diagrams ?? []) {
      locale.diagrams[diagram.id] = { title: "" }
      for (const node of diagram.nodes ?? []) {
        const nodeKey = `${diagram.id}:${node.id}`
        locale.nodes[nodeKey] = { title: "" }
        if (node.subtitle) locale.nodes[nodeKey].subtitle = ""
      }
      for (const edge of diagram.edges ?? []) locale.edges[`${diagram.id}:${edge.id}`] = { label: "", tooltip: "" }
    }
  }
  for (const endpoint of manifest.endpoints) {
    if (endpoint.description) locale.endpoints[endpoint.id] = { description: "" }
  }

  return locale
}

manifest.i18n = { ...manifest.i18n, defaultLocale: manifest.i18n?.defaultLocale ?? "ru" }
manifest.translations = translations
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log("Created translation slots: " + outputPath)

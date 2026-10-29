const Assignment = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/
const EnvironmentPolicy = { EmptyValue: "" } as const
const EnvironmentQuote = { Single: "'", Double: '"' } as const

export function parseEnvironmentFile(contents: string): Readonly<Record<string, string>> {
  const values: Record<string, string> = {}

  for (const line of contents.split(/\r?\n/)) {
    const entry = line.trim().match(Assignment)
    const key = entry?.[1]
    const rawValue = entry?.[2]

    if (!key || rawValue === undefined) continue

    const value = rawValue.trim()
    const quote = value[0]
    const isQuoted = (quote === EnvironmentQuote.Single || quote === EnvironmentQuote.Double) && value.endsWith(quote)
    const parsedValue = isQuoted ? value.slice(1, -1) : (value.split(/\s+#/, 1)[0] ?? EnvironmentPolicy.EmptyValue)

    values[key] = parsedValue.trim()
  }

  return values
}

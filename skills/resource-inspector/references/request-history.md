# HTTP request history

The Loki `requests` view selects structured entries with `msg="HTTP request completed"`. At minimum, emit `requestId`, `method`, `path`, `statusCode`, and `durationMs` so requests remain searchable and correlatable. Resource Inspector can read existing structured logs without any application change.

Capturing `input` and `output` requires optional instrumentation in the application. Do this only when the user explicitly asks for payload capture; otherwise keep the application untouched. If approved, attach the bundled helper to an Express-compatible backend after its JSON body parser, and pass the application's structured logger. Its `info(record, message)` call must flow through the existing Loki exporter:

```ts
app.use(jsonBodyParser())
app.use(createHttpHistoryMiddleware(applicationLogger))
```

Only for that approved integration, install this repository as a local dependency with `pnpm --dir <application-repo> add file:<resource-inspector-repo-path>`, then import `createHttpHistoryMiddleware` from `resource-inspector`. Enable it only with `INSPECTOR_CAPTURE_HTTP_PAYLOADS=true`; body capture is disabled otherwise and each body is limited to 16 KiB. Non-JSON and streaming bodies remain metadata-only. If the framework uses another request pipeline, adapt the same event fields to its middleware and logger.

Redact credentials and personal/payment fields before writing to stdout, files, or Loki. Review the application's log redaction and retention settings before enabling body capture. Do not capture authentication exchanges or secrets. Never expose raw bodies in maps, screenshots, or shared artifacts.

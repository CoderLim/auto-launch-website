# Code Review — v0.1

## Result

**APPROVE WITH FOLLOW-UPS.** The MVP is suitable for controlled real-account testing after the P0 issues found during review were fixed. Broad unattended rollout should wait for live provider contract tests.

## P0 findings fixed

- **GA4 Measurement ID response shape:** Google returns the web Measurement ID at `webStreamData.measurementId`, not at the DataStream top level. Fixed and covered by a test.
- **Cloudflare Email Routing enable request:** the current API accepts an optional domain body; the implementation no longer sends the incorrect `name: "@"` payload.
- **Production HTTPS audit:** a homepage `404` previously counted as healthy because all statuses below 500 passed. It now requires a 2xx/3xx response.
- Provider failures are not swallowed; unsupported Spaceship fails explicitly.
- State is domain-scoped to avoid accidentally resuming another site.
- Secrets are read from environment variables only and are not written to state.
- Namecheap XML error responses are checked instead of trusting HTTP 200.
- Existing GitHub repositories and Email Routing aliases are handled idempotently.
- GitHub Template API failures such as `422` are treated as failures, not success.

## Follow-ups

### P1 — Live provider contract tests

Run one disposable domain end-to-end against real Cloudflare, Namecheap, GA4, Site Verification and Search Console credentials before enabling unattended launches.

### P1 — Multi-label public suffixes in Namecheap adapter

The current dependency-free domain split assumes the final label is the TLD. Domains such as `example.co.uk` need a public-suffix-aware parser or explicit SLD/TLD configuration.

### P1 — GA4 idempotency if local state is lost

Normal retries are safe through `.auto-launch-state.json`, but deleting that state can create another GA4 property. Add provider-side lookup/tagging before high-volume rollout.

### P1 — Cloudflare redirect rules fresh-zone contract test

Test the `http_request_dynamic_redirect` entrypoint 404 response on a brand-new zone and lock the expected response shape with a mocked test.

### P1 — Standard template contract

Every standard site template should expose tested `hosting.deployCommand`, `hosting.customDomainCommand`, and `analytics.injectCommand` hooks.

### P2 — Spaceship registrar adapter

Not implemented in v0.1; the CLI fails explicitly when selected.

### P2 — YAML configuration

The MVP intentionally uses JSON and no runtime dependencies.

## Verification

- `npm run build`: PASS
- `npm test`: PASS (4/4)
- Dry-run exercises the configured full launch graph without provider credentials.
- Official API documentation checked during review for Cloudflare Email Routing/Redirect Rules and Google Analytics/Site Verification.

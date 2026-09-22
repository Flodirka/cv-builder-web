# CV Builder Web

A public, local-first resume editor with an optional Connected Builder handoff for MCP agents.
Open the published editor: [CV Builder Web](https://flodirka.github.io/cv-builder-web/).

Normal editing happens in the browser. When a user connects an agent, the relay holds the agent's
Markdown only long enough to deliver it to one Builder tab.

## Privacy model

- Editing, draft storage, local import/export, PDF generation, and finished-PDF inspection run in
  the browser.
- The editor has no accounts, analytics, advertising, upload API, database, or server-side PDF
  processing.
- `Save draft in browser` saves one draft in this site's browser storage. `Clear local data` removes
  it.
- The service worker caches only application files for offline use. It does not cache resume data.
- The optional Connected Builder relay receives only agent-supplied Markdown, holds it for at most
  five minutes, and deletes it after the user acknowledges the import. It never receives a local
  draft, ATS result, finished PDF, or PDF-inspection data.

See [PRIVACY.md](PRIVACY.md) for the complete data flow and browser-storage behavior.

## Development

Node.js 22 and npm are supported.

```bash
npm ci
npm run dev
```

## Verification

```bash
npm run security:self-test
npm run verify
npx playwright install chromium
npm run qa:static
npm audit --omit=dev --audit-level=high
```

`npm run security:check` writes a machine-readable report to
`.security-reports/public-security-scan.json`. Findings contain only paths and rule IDs, never
matched values.

## Static deployment

```bash
CV_BUILDER_BASE_PATH=/repository-name npm run build
```

The static site is written to `out/`. GitHub Pages hosts the editor; the optional Cloudflare Worker
below is a separate, short-lived Markdown handoff service.

## Connect an agent

CV Builder works without an account. To draft a resume with an MCP-capable agent, open the published
Builder, select **Connect agent**, and give the agent the displayed setup prompt. The MCP endpoint
is:

```text
https://cv-builder-relay.flodirka.workers.dev/mcp
```

The agent reads the `cv-builder/v1` Markdown guidance and calls `open_builder`. It returns a
one-time `#connect` link. Open that link in a browser within five minutes, review the replacement,
and choose **Replace current document** to import it. The link capability is removed from the visible
URL before the first relay request; after acknowledgement, the payload is deleted and reuse returns
`410 Gone`.

The Worker never renders, verifies, stores, or returns a PDF. The Builder is the only editor, ATS
checker, finished-PDF inspector, and PDF renderer. A static MCP Apps opener may be available in some
clients, but the browser link is the only proved integration path and is always returned.

The relay accepts canonical Markdown only. It does not accept raw HTML, JSON documents, files,
fetchable URLs, Notion, n8n, Telegram, accounts, OAuth, or a request to choose PDF presentation.

## Supported browsers and PDF limitations

The current release supports the latest stable desktop versions of Chromium-based browsers and
Firefox. Current Safari is expected to work, but automated PDF QA runs in Chromium. Mobile use is
supported at 390 CSS pixels and wider. Downloading or reopening a PDF may still follow the device
browser's file-handling rules.

PDF output is A4, one-column, vector/text, and embeds PT Serif for Latin and Cyrillic. It does not use
the system print driver, screenshots, or canvas. The editor verifies page size, extractable text,
safe links, and entry pagination, but it does not promise acceptance by every ATS vendor or preserve
unsupported fonts, scripts, interactive forms, media, or arbitrary HTML from imported files.

## License and security

The source is available under the [MIT License](LICENSE). Read [SECURITY.md](SECURITY.md) before
reporting a vulnerability, and [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

# CV Builder Web

A public, local-first resume editor. Resume content stays in the browser unless the user explicitly
downloads a PDF, Markdown file, or JSON backup.

## Privacy model

- Editing, draft storage, import, export, PDF generation, and finished-PDF inspection run locally in
  the browser.
- The app has no accounts, analytics, advertising, upload API, database, or server-side resume
  processing.
- `Save draft in browser` writes one draft to this site's local browser storage. `Clear local data`
  removes it.
- The service worker caches only application files for offline use. It does not cache resume data.

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
`.security-reports/public-security-scan.json`. Findings contain only a path and rule ID, never the
matched value.

## Static deployment

```bash
CV_BUILDER_BASE_PATH=/repository-name npm run build
```

The static site is written to `out/`. GitHub Pages deployment is intentionally separate from the
optional self-hosted automation service.

## Automation and self-hosting

CV Builder Web is the standalone editor and does not require a server. A second project, **CV
Builder Automation**, is planned as a separate downloadable repository for people who want to run
the document pipeline on their own server.

That service will be available as a release or container and can also be forked. Its first supported
setup will connect Notion through n8n, with Telegram as an optional delivery channel. The integration
boundary uses the shared `cv-builder/v1` document format, so future adapters can connect other
content sources, delivery channels, and agent workflows without turning this web editor into a
hosted account product.

CV Builder Automation is not part of this repository and is not required to use CV Builder Web.

## Supported browsers and PDF limitations

The current release supports the latest stable desktop versions of Chromium-based browsers and
Firefox. Current Safari is expected to work, but the automated PDF QA runs in Chromium. Mobile use
is supported at 390 CSS pixels and wider; downloading or reopening a PDF can still follow the
device browser's own file-handling rules.

PDF output is A4, one-column, vector/text, and embeds PT Serif for Latin and Cyrillic. It does not use
the system print driver, screenshots, or canvas. The editor verifies page size, extractable text,
safe links, and entry pagination, but it does not promise acceptance by every ATS vendor or preserve
unsupported fonts, scripts, interactive forms, media, or arbitrary HTML from imported files.

## License and security

The source is available under the [MIT License](LICENSE). Read [SECURITY.md](SECURITY.md) before
reporting a vulnerability and [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

# Contributing

CV Builder Web welcomes focused contributions to its public, local-first browser editor. The
maintainer curates the roadmap and is the only person who approves changes to `main`.

## Before opening an issue

- Use the issue forms to report reproducible bugs and propose well-scoped features.
- Do not attach a real resume, contact details, access token, or private document. Use fictional
  data and `example.com` contacts in issues, screenshots, tests, and fixtures.
- Report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in an
  issue.

## Pull requests

1. Open one focused PR against `main`. Explain the user-visible result and link the related issue,
   if there is one.
2. Keep the public application local-first. Do not add server persistence, analytics, accounts,
   Notion, n8n, Telegram, raw HTML import, or a PDF rendering service.
3. Add or update focused tests when behavior changes, and update public documentation when the
   contributor workflow, privacy model, or supported behavior changes.
4. Wait for maintainer review. Every PR needs the required checks and maintainer approval before it
   can merge. The maintainer decides whether to accept a contribution to keep the project coherent
   and supportable.

Before opening a pull request, run:

```bash
npm ci
npm run security:self-test
npm run verify
npx playwright install chromium
npm run qa:static
npm audit --omit=dev --audit-level=high
```

New reusable Actions must use a reviewed full commit SHA with a version comment and the narrowest
job permissions that work.

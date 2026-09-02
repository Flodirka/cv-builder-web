# Contributing

Use fictional resume data and `example.com` contacts in tests, issues, screenshots, and fixtures.

Before opening a pull request, run:

```bash
npm ci
npm run security:self-test
npm run verify
npx playwright install chromium
npm run qa:static
npm audit --omit=dev --audit-level=high
```

Keep changes focused on the public, local-first browser editor. The separate CV Builder Automation
repository owns server integrations. New reusable Actions must use a reviewed full commit SHA with
a version comment and the narrowest job permissions that work.

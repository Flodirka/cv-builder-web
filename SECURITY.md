# Security policy

## Supported version

Only the current `main` branch and the latest GitHub Pages deployment receive security fixes.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting form under the repository's Security tab.

Include the affected revision, browser, reproduction steps, expected result, and observed result.
Maintainers will acknowledge a valid report in the private thread and coordinate disclosure after a
fix is available.

## Repository controls

The public repository is expected to keep GitHub secret scanning, push protection, Dependabot alerts,
dependency review, and CodeQL enabled. Reusable Actions are pinned to full commit SHAs and workflow
permissions are scoped per job.

This repository contains only CV Builder Web. CV Builder Automation will publish its own supported
versions and reporting channel when the self-hosted service is released.

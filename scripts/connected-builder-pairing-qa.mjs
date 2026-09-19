import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const projectRoot = resolve(import.meta.dirname, "..");
const browserRoot = join(projectRoot, ".playwright-browsers");
if (existsSync(browserRoot)) process.env.PLAYWRIGHT_BROWSERS_PATH = browserRoot;

const { chromium } = await import("playwright");

const siteUrl = process.env.CV_BUILDER_QA_URL ?? "http://localhost:4173/CV_Builder/";
const relayOrigin = "https://cv-builder-relay.flodirka.workers.dev";
const capability = (value) => value.repeat(43);
const markdown = (name, language) => `---
schema: cv-builder/v1
language: ${language}
---

# ${name}

## Experience

### Example role
**Subtitle:** Example Studio
**Start:** 2024
**End:** Present
- Fictional local-first achievement.
`;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ headless: true });

const openConnectedPage = async (context, value) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}#connect=${value}`, { waitUntil: "load" });
  await page.waitForFunction(() => !window.location.hash, undefined, { timeout: 5_000 });
  return page;
};

const relayRoute = (context, handler) =>
  context.route(`${relayOrigin}/relay/v1/**`, async (route) => {
    const request = route.request();
    assert(
      request.headers().authorization?.startsWith("Bearer "),
      "Relay omitted Bearer capability"
    );
    assert(request.headers()["x-cv-builder-claim"], "Relay omitted claim nonce");
    assert(request.headers().referer === undefined, "Relay sent a referrer");
    assert(
      request.postData() === "{}" || request.postData() === '{"status":"imported"}',
      "Relay body changed"
    );
    await handler(route);
  });

try {
  const results = [];
  for (const fixture of [
    { id: "en", name: "Alex Example", language: "en", capability: capability("A") },
    { id: "ru", name: "Мария Пример", language: "ru", capability: capability("B") }
  ]) {
    const context = await browser.newContext();
    const requests = [];
    await relayRoute(context, async (route) => {
      requests.push(route.request());
      if (route.request().url().endsWith("/claim")) {
        await route.fulfill({
          status: 200,
          contentType: "text/markdown; charset=utf-8",
          body: markdown(fixture.name, fixture.language)
        });
      } else {
        await route.fulfill({ status: 204 });
      }
    });
    const page = await openConnectedPage(context, fixture.capability);
    await page.getByRole("button", { name: "Replace current document" }).click();
    assert(
      (await page.getByPlaceholder("Heading text").first().inputValue()) === fixture.name,
      `${fixture.id} Markdown did not produce an editable document`
    );
    await page.getByText("Connected Builder resume imported", { exact: true }).waitFor();
    assert(
      await page.evaluate(() => sessionStorage.getItem("cv-builder.connected-builder.v1") === null),
      `${fixture.id} capability persisted after acknowledgement`
    );
    assert(requests.length === 2, `${fixture.id} relay flow did not claim and acknowledge once`);
    results.push(`${fixture.id} import`);
    await context.close();
  }

  {
    const context = await browser.newContext();
    await relayRoute(context, (route) =>
      route.fulfill({ status: 200, contentType: "text/markdown; charset=utf-8", body: "" })
    );
    const page = await openConnectedPage(context, capability("C"));
    await page.getByText("Connected Builder received invalid Markdown", { exact: false }).waitFor();
    assert(
      (await page.getByPlaceholder("Heading text").count()) === 0,
      "Invalid Markdown changed the document"
    );
    results.push("invalid Markdown");
    await context.close();
  }

  for (const id of ["expired", "replayed"]) {
    const context = await browser.newContext();
    await relayRoute(context, (route) => route.fulfill({ status: 410 }));
    const page = await openConnectedPage(context, capability(id === "expired" ? "D" : "E"));
    await page.getByText("Connected Builder link has expired", { exact: true }).waitFor();
    results.push(id);
    await context.close();
  }

  {
    const context = await browser.newContext();
    let claims = 0;
    await relayRoute(context, (route) => {
      claims += 1;
      return route.abort("internetdisconnected");
    });
    const page = await openConnectedPage(context, capability("F"));
    await page.getByText("Connected Builder is unavailable", { exact: false }).waitFor();
    await page.reload({ waitUntil: "load" });
    await page.getByText("Connected Builder is unavailable", { exact: false }).waitFor();
    assert(claims === 2, "Refresh did not retry the stored same-tab claim");
    results.push("offline and refresh");
    await context.close();
  }

  {
    const context = await browser.newContext();
    let relayRequests = 0;
    await relayRoute(context, (route) => {
      relayRequests += 1;
      return route.abort();
    });
    const page = await context.newPage();
    await page.goto(siteUrl, { waitUntil: "load" });
    await page.getByRole("button", { name: "Import" }).click();
    await page.locator("#resume-markdown-import").setInputFiles({
      name: "ordinary-local.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(markdown("Local Example", "en"))
    });
    await page.getByRole("button", { name: "Replace current document" }).click();
    assert(
      (await page.getByPlaceholder("Heading text").first().inputValue()) === "Local Example",
      "Ordinary local editing changed"
    );
    assert(relayRequests === 0, "Ordinary local editing called the relay");
    results.push("ordinary local editing");
    await context.close();
  }

  process.stdout.write(`${JSON.stringify({ siteUrl, results }, null, 2)}\n`);
} finally {
  await browser.close();
}

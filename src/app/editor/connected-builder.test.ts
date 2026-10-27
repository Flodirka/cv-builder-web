import { describe, expect, it, vi } from "vitest";
import {
  acknowledgeRelayImport,
  claimRelayMarkdown,
  CONNECTED_BUILDER_MCP_ENDPOINT,
  CONNECTED_BUILDER_SETUP_PROMPT,
  connectedBuilderStorageKey,
  readRelayConnection,
  takeRelayCapabilityFromFragment
} from "./connected-builder";

const capability = "A".repeat(43);
const nonce = "B".repeat(22);

describe("Connected Builder relay client", () => {
  it("takes only a valid fragment capability and immediately removes it from the visible URL", () => {
    const replaceState = vi.fn();
    expect(
      takeRelayCapabilityFromFragment(
        { hash: `#connect=${capability}`, pathname: "/cv-builder-web/", search: "" },
        { replaceState }
      )
    ).toBe(capability);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/cv-builder-web/");
    expect(
      takeRelayCapabilityFromFragment(
        { hash: "#connect=not-a-capability", pathname: "/cv-builder-web/", search: "" },
        { replaceState }
      )
    ).toBeUndefined();
  });

  it("does not retain malformed stored capabilities", () => {
    const storage = {
      getItem: vi.fn(() =>
        JSON.stringify({ capability: "bad", claimNonce: nonce, phase: "claim" })
      ),
      removeItem: vi.fn(),
      setItem: vi.fn()
    };
    expect(readRelayConnection(storage)).toBeUndefined();
    expect(storage.removeItem).toHaveBeenCalledWith(connectedBuilderStorageKey);
  });

  it("claims fictional Markdown without credentials or a referrer", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response("# Alex Example", {
          headers: { "Content-Type": "text/markdown; charset=utf-8" }
        })
    );
    await expect(
      claimRelayMarkdown({ capability, claimNonce: nonce, phase: "claim" }, fetcher)
    ).resolves.toEqual({
      kind: "ready",
      markdown: "# Alex Example"
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(/\/relay\/v1\/claim$/),
      expect.objectContaining({
        credentials: "omit",
        referrerPolicy: "no-referrer",
        body: "{}"
      })
    );
  });

  it("exposes the reviewed MCP endpoint and a copyable setup prompt", () => {
    expect(CONNECTED_BUILDER_MCP_ENDPOINT).toBe(
      "https://cv-builder-relay.flodirka.workers.dev/mcp"
    );
    expect(CONNECTED_BUILDER_SETUP_PROMPT).toContain(CONNECTED_BUILDER_MCP_ENDPOINT);
    expect(CONNECTED_BUILDER_SETUP_PROMPT).toContain("open_builder");
    expect(CONNECTED_BUILDER_SETUP_PROMPT).toContain("cv-builder/v1");
    expect(CONNECTED_BUILDER_SETUP_PROMPT).not.toMatch(/#connect=/u);
  });

  it("retries a lost acknowledgement response and accepts terminal expiry", async () => {
    let attempts = 0;
    const fetcher = vi.fn(async (): Promise<Response> => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
      return new Response(null, { status: 410 });
    });
    const wait = vi.fn(async () => {});
    await expect(
      acknowledgeRelayImport({ capability, claimNonce: nonce, phase: "ack" }, fetcher, wait)
    ).resolves.toBe("complete");
    expect(wait).toHaveBeenCalledWith(250);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

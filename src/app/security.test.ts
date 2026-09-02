import { describe, expect, it } from "vitest";
import { STATIC_CONTENT_SECURITY_POLICY } from "./security";

describe("static Content Security Policy", () => {
  it("blocks plugins, frames, forms, remote connections, and eval", () => {
    expect(STATIC_CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(STATIC_CONTENT_SECURITY_POLICY).toContain("frame-src 'none'");
    expect(STATIC_CONTENT_SECURITY_POLICY).toContain("form-action 'none'");
    expect(STATIC_CONTENT_SECURITY_POLICY).toContain("connect-src 'self' data:");
    expect(STATIC_CONTENT_SECURITY_POLICY).toContain("'wasm-unsafe-eval'");
    expect(STATIC_CONTENT_SECURITY_POLICY).not.toContain("'unsafe-eval'");
    expect(STATIC_CONTENT_SECURITY_POLICY).not.toContain("http:");
    expect(STATIC_CONTENT_SECURITY_POLICY).not.toContain("https:");
  });
});

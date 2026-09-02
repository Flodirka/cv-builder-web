import { describe, expect, it } from "vitest";
import { isSafeHttpUrl, toSafeHttpUrl } from "../src";

describe("safe HTTP URLs", () => {
  it.each([
    ["https://example.com/profile", "https://example.com/profile"],
    ["http://example.com", "http://example.com/"]
  ])("accepts %s", (input, normalized) => {
    expect(isSafeHttpUrl(input)).toBe(true);
    expect(toSafeHttpUrl(input)).toBe(normalized);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "file:///tmp/resume",
    "/relative/path",
    "https:example.com",
    "https:///example.com",
    "https://example.com\\profile",
    "https://example.com/\nprofile",
    "https://user:secret@example.com",
    " https://example.com",
    "not a url"
  ])("rejects %s", (input) => {
    expect(isSafeHttpUrl(input)).toBe(false);
    expect(toSafeHttpUrl(input)).toBeUndefined();
  });
});

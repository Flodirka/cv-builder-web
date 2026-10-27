import { describe, expect, it } from "vitest";
import { isSafeHttpUrl, toSafeHttpUrl, toSafeImageUrl } from "../src";

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

describe("safe image URLs", () => {
  it("accepts HTTPS URLs and PNG/JPEG data URLs", () => {
    expect(toSafeImageUrl("https://example.com/photo.jpg")).toBe("https://example.com/photo.jpg");
    expect(toSafeImageUrl("data:image/png;base64,aGVsbG8=")).toBe("data:image/png;base64,aGVsbG8=");
    expect(toSafeImageUrl("data:image/jpeg;base64,aGVsbG8=")).toBe(
      "data:image/jpeg;base64,aGVsbG8="
    );
  });

  it.each(["data:text/html,unsafe", "data:image/svg+xml,<svg></svg>", "javascript:alert(1)"])(
    "rejects %s",
    (input) => {
      expect(toSafeImageUrl(input)).toBeUndefined();
    }
  );
});

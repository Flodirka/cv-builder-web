import { describe, expect, it } from "vitest";
import {
  PDF_INSPECTION_LIMITS,
  PUBLIC_FILE_LIMITS,
  PublicFileLimitError,
  assertPublicFileSize
} from "./file-limits";

describe("public file limits", () => {
  it("defines explicit limits for every local import surface", () => {
    expect(PUBLIC_FILE_LIMITS).toEqual({
      json: { bytes: 2_097_152, label: "2 MiB", displayName: "JSON" },
      markdown: { bytes: 1_048_576, label: "1 MiB", displayName: "Markdown" },
      plainText: { bytes: 524_288, label: "512 KiB", displayName: "plain-text" },
      pdf: { bytes: 20_971_520, label: "20 MiB", displayName: "PDF" }
    });
    expect(PDF_INSPECTION_LIMITS).toEqual({
      pages: 50,
      textItemsPerPage: 50_000,
      characters: 2_000_000
    });
  });

  it("accepts the exact byte limit and rejects larger or invalid sizes", () => {
    expect(() =>
      assertPublicFileSize({ size: PUBLIC_FILE_LIMITS.markdown.bytes }, "markdown")
    ).not.toThrow();
    expect(() =>
      assertPublicFileSize({ size: PUBLIC_FILE_LIMITS.markdown.bytes + 1 }, "markdown")
    ).toThrow(PublicFileLimitError);
    expect(() => assertPublicFileSize({ size: Number.NaN }, "json")).toThrow(
      "The selected file exceeds the 2 MiB JSON limit."
    );
  });
});

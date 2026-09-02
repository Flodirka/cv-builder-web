import { describe, expect, it } from "vitest";
import { englishSampleResume, resumeBlockSchema, resumeSchema, russianSampleResume } from "../src";

describe("resume schemas", () => {
  it("accepts both fictional fixtures", () => {
    expect(resumeSchema.parse(englishSampleResume)).toEqual(englishSampleResume);
    expect(resumeSchema.parse(russianSampleResume)).toEqual(russianSampleResume);
  });

  it("rejects missing identity data and malformed blocks", () => {
    expect(resumeSchema.safeParse({ language: "en", person: { links: [] } }).success).toBe(false);
    expect(
      resumeBlockSchema.safeParse({
        id: "empty-heading",
        type: "heading",
        zone: "main",
        level: 2,
        text: "",
        visible: true
      }).success
    ).toBe(false);
  });
});

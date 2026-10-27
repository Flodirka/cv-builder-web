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

  it("accepts optional presentation fields for the single A4 renderer", () => {
    expect(
      resumeBlockSchema.safeParse({
        id: "section",
        type: "heading",
        zone: "main",
        level: 2,
        text: "Experience",
        align: "center",
        icon: "briefcase",
        visible: true
      }).success
    ).toBe(true);
    expect(
      resumeBlockSchema.safeParse({
        id: "skills",
        type: "bullet_list",
        zone: "sidebar",
        items: ["Systems design"],
        align: "left",
        columns: 2,
        visible: true
      }).success
    ).toBe(true);
    expect(
      resumeBlockSchema.safeParse({
        id: "photo",
        type: "image",
        zone: "header",
        src: "https://example.com/photo.jpg",
        alt: "Photo",
        shape: "circle",
        visible: true
      }).success
    ).toBe(true);
  });

  it("rejects unknown icons and column counts", () => {
    expect(
      resumeBlockSchema.safeParse({
        id: "section",
        type: "heading",
        zone: "main",
        level: 2,
        text: "Experience",
        icon: "rocket",
        visible: true
      }).success
    ).toBe(false);
    expect(
      resumeBlockSchema.safeParse({
        id: "skills",
        type: "bullet_list",
        zone: "sidebar",
        items: ["Systems design"],
        columns: 3,
        visible: true
      }).success
    ).toBe(false);
  });
});

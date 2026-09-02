import { describe, expect, it } from "vitest";
import { englishSampleResume, russianSampleResume } from "./fixtures";
import { resumeBlockSchema, resumeSchema } from "./schema";
import { buildDefaultResumeBlocks } from "./block-model";
import { createA4DocumentModel } from "@/templates";

const containsForbiddenNotionKeys = (value: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(containsForbiddenNotionKeys);
  }

  const record = value as Record<string, unknown>;
  return Object.keys(record).some((key) => key.startsWith("notion")) ||
    Object.values(record).some(containsForbiddenNotionKeys)
    ? true
    : false;
};

describe("resume schema", () => {
  it("accepts the English sample resume", () => {
    expect(resumeSchema.safeParse(englishSampleResume).success).toBe(true);
  });

  it("accepts the Russian sample resume", () => {
    expect(resumeSchema.safeParse(russianSampleResume).success).toBe(true);
  });

  it("requires document language instead of defaulting to English", () => {
    const withoutLanguage: Record<string, unknown> = structuredClone(englishSampleResume);
    delete withoutLanguage.language;
    expect(resumeSchema.safeParse(withoutLanguage).success).toBe(false);
  });

  it("rejects invalid block payloads with readable issues", () => {
    const result = resumeBlockSchema.safeParse({
      id: "",
      type: "heading",
      zone: "main",
      level: 4,
      text: "",
      visible: true
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining(["Block id is required", "Heading text is required"])
      );
    }
  });

  it("accepts optional text links on layout blocks", () => {
    const result = resumeBlockSchema.safeParse({
      id: "contact-links",
      type: "paragraph",
      zone: "header",
      text: "Telegram · LinkedIn",
      textLinks: [
        { label: "Telegram", url: "https://t.me/example_channel" },
        { label: "LinkedIn", url: "https://www.linkedin.com/in/example-profile" }
      ],
      visible: true
    });

    expect(result.success).toBe(true);
  });

  it("builds strict default blocks from the English normalized model", () => {
    const blocks = buildDefaultResumeBlocks({ ...englishSampleResume, layoutBlocks: [] });

    expect(blocks.map((block) => block.type)).toEqual(
      expect.arrayContaining(["heading", "paragraph", "entry", "bullet_list"])
    );
    expect(blocks.every((block) => resumeBlockSchema.safeParse(block).success)).toBe(true);
  });

  it("builds localized section headings for the Russian normalized model", () => {
    const blocks = buildDefaultResumeBlocks({ ...russianSampleResume, layoutBlocks: [] });

    expect(blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "heading", text: "О себе" }),
        expect.objectContaining({ type: "heading", text: "Опыт" })
      ])
    );
  });

  it("provides the A4 renderer with domain blocks and no Notion payload", () => {
    const model = createA4DocumentModel({
      ...englishSampleResume,
      layoutBlocks: [
        ...englishSampleResume.layoutBlocks,
        { id: "future-sidebar", type: "spacer", zone: "sidebar", size: "sm", visible: true }
      ]
    });

    expect(model.blocks.every((block) => block.zone !== "sidebar")).toBe(true);
    expect(containsForbiddenNotionKeys(model)).toBe(false);
  });
});

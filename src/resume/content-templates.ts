import { z } from "zod";
import { buildDefaultResumeBlocks } from "./block-model";
import { englishSampleResume } from "./fixtures";
import { resumeBlockSchema, resumeSchema, type Resume } from "./schema";

export const contentTemplateSchema = z.object({
  name: z.string().trim().min(1, "Template name is required"),
  language: z.enum(["en", "ru"]),
  blocks: z.array(resumeBlockSchema)
});

export type ContentTemplate = z.infer<typeof contentTemplateSchema>;

const cloneBlocks = (blocks: ContentTemplate["blocks"]) =>
  blocks.map((block) => resumeBlockSchema.parse(structuredClone(block)));

const buildClassicCompactBlocks = (): ContentTemplate["blocks"] =>
  buildDefaultResumeBlocks(englishSampleResume).flatMap((block) => {
    if (block.id === "section-summary") return [];
    if (block.id === "summary-body") {
      return [resumeBlockSchema.parse({ ...block, zone: "header" })];
    }
    return [block];
  });

export const builtInContentTemplates: readonly ContentTemplate[] = [
  {
    name: "Classic Compact",
    language: "en",
    blocks: buildClassicCompactBlocks()
  },
  {
    name: "Simple ATS",
    language: "en",
    blocks: buildDefaultResumeBlocks(englishSampleResume)
  }
];

export const createResumeFromContentTemplate = (template: ContentTemplate): Resume => {
  const validated = contentTemplateSchema.parse(template);
  const nameBlock = validated.blocks.find(
    (block) => block.type === "heading" && block.level === 1 && block.zone === "header"
  );

  return resumeSchema.parse({
    language: validated.language,
    person: {
      fullName:
        nameBlock?.type === "heading"
          ? nameBlock.text
          : validated.language === "ru"
            ? "Резюме"
            : "Resume",
      links: []
    },
    summary: undefined,
    experience: [],
    education: [],
    projects: [],
    skills: [],
    languages: [],
    certificates: [],
    customSections: [],
    layoutBlocks: cloneBlocks(validated.blocks)
  });
};

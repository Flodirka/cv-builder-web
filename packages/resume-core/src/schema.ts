import { z } from "zod";

export const resumeZoneSchema = z.enum(["header", "sidebar", "main", "footer"]);

export const resumeLinkSchema = z.object({
  label: z.string().min(1, "Link label is required"),
  url: z.string().min(1, "Link URL is required")
});

export const resumeEntrySchema = z.object({
  title: z.string().min(1, "Entry title is required"),
  subtitle: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  bullets: z.array(z.string().min(1, "Bullet text is required")).default([]),
  links: z.array(resumeLinkSchema).optional()
});

const blockBaseSchema = z.object({
  id: z.string().min(1, "Block id is required"),
  zone: resumeZoneSchema,
  visible: z.boolean(),
  textLinks: z.array(resumeLinkSchema).optional()
});

export const headingBlockSchema = blockBaseSchema.extend({
  type: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string().min(1, "Heading text is required")
});

export const paragraphBlockSchema = blockBaseSchema.extend({
  type: z.literal("paragraph"),
  text: z.string().min(1, "Paragraph text is required")
});

export const labeledTextBlockSchema = blockBaseSchema.extend({
  type: z.literal("labeled_text"),
  label: z.string().min(1, "Label is required"),
  text: z.string().min(1, "Text is required")
});

export const bulletListBlockSchema = blockBaseSchema.extend({
  type: z.literal("bullet_list"),
  items: z
    .array(z.string().min(1, "Bullet text is required"))
    .min(1, "At least one bullet is required")
});

export const dividerBlockSchema = blockBaseSchema.extend({
  type: z.literal("divider")
});

export const spacerBlockSchema = blockBaseSchema.extend({
  type: z.literal("spacer"),
  size: z.enum(["xs", "sm", "md", "lg"])
});

export const entryBlockSchema = blockBaseSchema.extend({
  type: z.literal("entry"),
  entry: resumeEntrySchema
});

export const resumeBlockSchema = z.discriminatedUnion("type", [
  headingBlockSchema,
  paragraphBlockSchema,
  labeledTextBlockSchema,
  bulletListBlockSchema,
  dividerBlockSchema,
  spacerBlockSchema,
  entryBlockSchema
]);

export const resumeSchema = z.object({
  language: z.enum(["en", "ru"]),
  person: z.object({
    fullName: z.string().min(1, "Full name is required"),
    headline: z.string().optional(),
    email: z.string().email("Email must be valid").optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    links: z.array(resumeLinkSchema).default([])
  }),
  summary: z.string().optional(),
  experience: z.array(resumeEntrySchema).default([]),
  education: z.array(resumeEntrySchema).default([]),
  projects: z.array(resumeEntrySchema).default([]),
  skills: z
    .array(
      z.object({
        group: z.string().optional(),
        items: z.array(z.string().min(1, "Skill is required")).min(1, "Skill group cannot be empty")
      })
    )
    .default([]),
  languages: z
    .array(
      z.object({
        name: z.string().min(1, "Language name is required"),
        level: z.string().optional()
      })
    )
    .default([]),
  certificates: z.array(resumeEntrySchema).default([]),
  customSections: z
    .array(
      z.object({
        title: z.string().min(1, "Custom section title is required"),
        items: z.array(z.union([resumeEntrySchema, z.string().min(1)])).default([])
      })
    )
    .default([]),
  layoutBlocks: z.array(resumeBlockSchema).default([])
});

export type ResumeZone = z.infer<typeof resumeZoneSchema>;
export type ResumeLink = z.infer<typeof resumeLinkSchema>;
export type ResumeEntry = z.infer<typeof resumeEntrySchema>;
export type ResumeBlock = z.infer<typeof resumeBlockSchema>;
export type Resume = z.infer<typeof resumeSchema>;

import { z } from "zod";
import { toSafeImageUrl } from "./safe-url";
import { lucideIconNames } from "./lucide-icon-names";

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

export const blockAlignSchema = z.enum(["left", "center", "right"]);

export const resumeIconSchema = z.enum([
  "user",
  "briefcase",
  "tools",
  "languages",
  "education",
  "award",
  "mail",
  "phone",
  "location",
  "link",
  "summary",
  "skills",
  ...lucideIconNames
]);

const alignedBlockBaseSchema = blockBaseSchema.extend({
  align: blockAlignSchema.optional()
});

export const headingBlockSchema = alignedBlockBaseSchema.extend({
  type: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string().min(1, "Heading text is required"),
  icon: resumeIconSchema.optional(),
  underline: z.boolean().optional(),
  uppercase: z.boolean().optional(),
  bold: z.boolean().optional()
});

export const paragraphBlockSchema = alignedBlockBaseSchema.extend({
  type: z.literal("paragraph"),
  text: z.string().min(1, "Paragraph text is required")
});

export const labeledTextBlockSchema = alignedBlockBaseSchema.extend({
  type: z.literal("labeled_text"),
  label: z.string().min(1, "Label is required"),
  text: z.string().min(1, "Text is required")
});

export const bulletListBlockSchema = alignedBlockBaseSchema.extend({
  type: z.literal("bullet_list"),
  items: z
    .array(z.string().min(1, "Bullet text is required"))
    .min(1, "At least one bullet is required"),
  columns: z.union([z.literal(1), z.literal(2)]).optional()
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

export const imageBlockSchema = blockBaseSchema.extend({
  type: z.literal("image"),
  src: z
    .string()
    .min(1, "Image source is required")
    .refine((value) => toSafeImageUrl(value) !== undefined, {
      message: "Image source must be an HTTPS URL or PNG/JPEG data URL"
    }),
  alt: z.string().min(1, "Alt text is required"),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  shape: z.enum(["square", "rounded", "circle"]).optional(),
  placement: z.enum(["left", "right", "above"]).optional()
});

const leafResumeBlockSchema = z.discriminatedUnion("type", [
  headingBlockSchema,
  paragraphBlockSchema,
  labeledTextBlockSchema,
  bulletListBlockSchema,
  dividerBlockSchema,
  spacerBlockSchema,
  entryBlockSchema,
  imageBlockSchema,
  blockBaseSchema.extend({ type: z.literal("page_break") }),
  alignedBlockBaseSchema.extend({
    type: z.literal("table"),
    widths: z.array(z.number().positive()).min(2).max(6),
    rows: z.array(z.array(z.string())).min(1),
    header: z.boolean().default(true)
  })
]);

export type ColumnsBlock = z.infer<typeof blockBaseSchema> & {
  type: "columns";
  columns: Array<{ width: number; blocks: ResumeBlock[] }>;
};
export type ResumeBlock = z.infer<typeof leafResumeBlockSchema> | ColumnsBlock;

export const columnsBlockSchema = blockBaseSchema.extend({
  type: z.literal("columns"),
  columns: z
    .array(
      z.object({
        width: z.number().positive().default(1),
        blocks: z.array(z.lazy(() => resumeBlockSchema))
      })
    )
    .min(2)
    .max(3)
});

export const resumeBlockSchema: z.ZodType<ResumeBlock> = z.lazy(() =>
  z
    .discriminatedUnion("type", [...leafResumeBlockSchema.options, columnsBlockSchema])
    .refine(
      (block) =>
        block.type !== "table" || block.rows.every((row) => row.length === block.widths.length),
      { message: "Every table row must match the number of columns" }
    )
);

export const resumeSchema = z.object({
  language: z.enum(["en", "ru", "ja"]),
  layout: z.enum(["one-column", "two-column"]).optional(),
  person: z.object({
    fullName: z.string().min(1, "Full name is required"),
    headline: z.string().optional(),
    email: z.string().email("Email must be valid").optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    photo: z
      .string()
      .refine(
        (value) => toSafeImageUrl(value) !== undefined,
        "Photo must be an HTTPS URL or PNG/JPEG data URL"
      )
      .optional(),
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
export type ResumeLayout = NonNullable<z.infer<typeof resumeSchema>["layout"]>;
export type BlockAlign = z.infer<typeof blockAlignSchema>;
export type ResumeIcon = z.infer<typeof resumeIconSchema>;
export type ResumeLink = z.infer<typeof resumeLinkSchema>;
export type ResumeEntry = z.infer<typeof resumeEntrySchema>;
export type ImageBlock = z.infer<typeof imageBlockSchema>;
export type Resume = z.infer<typeof resumeSchema>;

import { z } from "zod";
import { buildDefaultResumeBlocks, flattenResumeBlocks, groupBodyRows } from "./block-model";
import { englishSampleResume } from "./fixtures";
import { japaneseTemplateBlocks } from "./japanese-template";
import {
  resumeBlockSchema,
  resumeSchema,
  type Resume,
  type ResumeBlock,
  type ResumeIcon
} from "./schema";

export const contentTemplateSchema = z.object({
  name: z.string().trim().min(1, "Template name is required"),
  language: z.enum(["en", "ru", "ja"]),
  blocks: z.array(resumeBlockSchema)
});

export type ContentTemplate = z.infer<typeof contentTemplateSchema>;

// Fictional examples for editing; the approved interchange fixtures stay unchanged.
const templateExample: Resume = {
  ...englishSampleResume,
  person: { ...englishSampleResume.person, location: "Berlin, Germany" },
  summary:
    "Game designer with seven years of experience in progression systems and live operations. Turns playtest findings into feature specifications and measurable improvements to onboarding.",
  experience: [
    {
      title: "Senior Game Designer",
      subtitle: "Example Studio",
      start: "2021",
      end: "Present",
      location: "Berlin, Germany",
      bullets: [
        "Redesigned tutorial progression after six playtests, reducing first-session drop-off from 32% to 24%.",
        "Wrote specifications for eight seasonal events and coordinated delivery with art, engineering and QA.",
        "Created an economy dashboard that helped the team review reward balance before each release."
      ]
    },
    {
      title: "Game Designer",
      subtitle: "Prototype Team",
      start: "2019",
      end: "2021",
      location: "Berlin, Germany",
      bullets: [
        "Built and tested three combat prototypes; the team selected one for production.",
        "Documented progression rules and edge cases, giving engineers a shared reference for implementation."
      ]
    }
  ],
  education: [
    { title: "BSc, Computer Systems", subtitle: "Example University", end: "2019", bullets: [] }
  ],
  projects: [
    {
      title: "Progression Simulator",
      subtitle: "Independent project",
      start: "2023",
      end: "2024",
      links: [{ label: "Project", url: "https://example.com/projects/progression" }],
      bullets: [
        "Built a browser tool to compare reward curves and shared the source with a community of game designers."
      ]
    }
  ],
  certificates: [
    { title: "Game Economy Design", subtitle: "Example Academy", end: "2024", bullets: [] }
  ],
  customSections: [
    {
      title: "Interests",
      items: ["Writes practical notes on game balancing and runs monthly prototype playtests."]
    }
  ]
};

const cloneBlocks = (blocks: ContentTemplate["blocks"]) =>
  blocks.map((block) => resumeBlockSchema.parse(structuredClone(block)));

const patchBlocks = (
  blocks: ContentTemplate["blocks"],
  patches: Record<string, Record<string, unknown>>
): ContentTemplate["blocks"] =>
  blocks.map((block) => {
    const patch = patches[block.id];
    return patch ? resumeBlockSchema.parse({ ...block, ...patch }) : block;
  });

const dividerBlock = (id: string): ContentTemplate["blocks"][number] =>
  resumeBlockSchema.parse({ id, type: "divider", zone: "main", visible: true });

// Neutral 1px PNG placeholder: replaced by the user photo upload in the editor.
const placeholderPhoto =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGN48eLFfwAJLAO4YZx5VQAAAABJRU5ErkJggg==";

const circlePhotoBlock = (id: string) =>
  resumeBlockSchema.parse({
    id,
    type: "image",
    zone: "header",
    src: placeholderPhoto,
    alt: templateExample.person.fullName,
    width: 96,
    height: 96,
    shape: "circle",
    visible: true
  });

const withCirclePhoto = (blocks: ContentTemplate["blocks"]): ContentTemplate["blocks"] => {
  const photoIndex = blocks.findIndex((block) => block.type === "image" && block.zone === "header");
  if (photoIndex === -1) {
    const headerEnd = blocks.reduce(
      (last, block, index) => (block.zone === "header" ? index : last),
      -1
    );
    const next = [...blocks];
    next.splice(headerEnd + 1, 0, circlePhotoBlock("person-photo"));
    return next;
  }
  return patchBlocks(blocks, {
    [blocks[photoIndex]?.id ?? "person-photo"]: { shape: "circle", width: 96, height: 96 }
  });
};

const sectionIcon: Record<string, ResumeIcon> = {
  "section-personal-info": "lucide:user-round",
  "section-summary": "lucide:file-text",
  "section-experience": "lucide:briefcase",
  "section-education": "lucide:graduation-cap",
  "section-projects": "lucide:link",
  "section-skills": "lucide:chart-column",
  "section-tools": "lucide:wrench",
  "section-languages": "lucide:languages",
  "section-certificates": "lucide:award"
};

const withSectionIcons = (blocks: ContentTemplate["blocks"]): ContentTemplate["blocks"] =>
  blocks.map((block) => {
    const icon = block.type === "heading" && block.level === 2 ? sectionIcon[block.id] : undefined;
    return icon ? resumeBlockSchema.parse({ ...block, icon }) : block;
  });

const withLeftHeader = (blocks: ContentTemplate["blocks"]): ContentTemplate["blocks"] =>
  blocks.map((block) =>
    block.zone === "header" &&
    (block.type === "heading" ||
      block.type === "paragraph" ||
      block.type === "labeled_text" ||
      block.type === "bullet_list")
      ? resumeBlockSchema.parse({ ...block, align: "left" })
      : block
  );

const buildClassicCompactBlocks = (): ContentTemplate["blocks"] =>
  buildDefaultResumeBlocks(templateExample).flatMap((block) => {
    if (block.id === "section-summary") return [];
    if (block.id === "summary-body") {
      return [resumeBlockSchema.parse({ ...block, zone: "header" })];
    }
    return [block];
  });

const buildTwoColumnBlocks = (): ContentTemplate["blocks"] => {
  const baseBlocks = buildDefaultResumeBlocks(templateExample);
  const mapped = baseBlocks.flatMap((block) => {
    if (block.id === "person-contact") {
      return [
        resumeBlockSchema.parse({
          id: "section-personal-info",
          type: "heading",
          zone: "sidebar",
          level: 2,
          text: "Personal info",
          visible: true
        }),
        resumeBlockSchema.parse({
          id: "personal-links",
          type: "paragraph",
          zone: "sidebar",
          text: "Portfolio · LinkedIn",
          textLinks: [
            { label: "Portfolio", url: "https://example.com" },
            { label: "LinkedIn", url: "https://example.com/profile" }
          ],
          visible: true
        }),
        resumeBlockSchema.parse({
          id: "personal-email",
          type: "labeled_text",
          zone: "sidebar",
          label: "E-mail",
          text: "alex@example.com",
          visible: true
        }),
        resumeBlockSchema.parse({
          id: "personal-messenger",
          type: "labeled_text",
          zone: "sidebar",
          label: "Location",
          text: "Berlin, Germany",
          visible: true
        })
      ];
    }
    if (block.id === "section-skills") {
      return [resumeBlockSchema.parse({ ...block, zone: "sidebar" })];
    }
    if (block.id === "skills-list") {
      return [
        resumeBlockSchema.parse({
          ...block,
          zone: "sidebar",
          items: ["Systems design", "Economy", "Live ops", "Balancing", "UX design"]
        }),
        resumeBlockSchema.parse({
          id: "section-tools",
          type: "heading",
          zone: "sidebar",
          level: 2,
          text: "Tools",
          visible: true
        }),
        resumeBlockSchema.parse({
          id: "tools-list",
          type: "bullet_list",
          zone: "sidebar",
          items: ["Figma", "Miro", "Jira"],
          visible: true
        })
      ];
    }
    if (block.id === "section-languages") {
      return [resumeBlockSchema.parse({ ...block, zone: "sidebar" })];
    }
    if (block.id === "languages-list") {
      return [
        resumeBlockSchema.parse({
          ...block,
          zone: "sidebar",
          items: ["English: C1", "Russian: Native"]
        })
      ];
    }
    if (block.id === "section-summary") return [];
    if (block.id === "summary-body") {
      return [resumeBlockSchema.parse({ ...block, zone: "header" })];
    }
    if (block.id === "section-projects" || block.id === "projects-0") return [];
    if (block.id === "section-certificates") {
      return [resumeBlockSchema.parse({ ...block, text: "Awards" })];
    }
    if (block.id === "certificates-0" && block.type === "entry") {
      return [
        resumeBlockSchema.parse({
          ...block,
          entry: { ...block.entry, title: "Game Design Award", subtitle: "Example Festival" }
        })
      ];
    }
    if (block.id === "custom-0" || block.id === "custom-0-0") return [];
    return [block];
  });
  return withSectionIcons(
    patchBlocks(withCirclePhoto(mapped), {
      "skills-list": { columns: 2 }
    })
  ).map((block) =>
    block.type === "heading" && block.level === 2
      ? resumeBlockSchema.parse({ ...block, underline: false, uppercase: false })
      : block
  );
};

const buildCenteredBlocks = (): ContentTemplate["blocks"] => {
  const base = buildDefaultResumeBlocks(templateExample).filter(
    (block) => block.zone === "header" || block.zone === "main"
  );
  const centered = base.map((block) => {
    if (block.type === "heading")
      return resumeBlockSchema.parse({
        ...block,
        align: "center",
        ...(block.level === 2 ? { uppercase: false, bold: false } : {})
      });
    if (block.type === "paragraph" && block.zone === "header") {
      return resumeBlockSchema.parse({ ...block, align: "center" });
    }
    return block;
  });
  return centered;
};

const pickSection = (base: ContentTemplate["blocks"], key: string): ContentTemplate["blocks"] => {
  const heading = base.filter((block) => block.id === `section-${key}`);
  const entries = base.filter(
    (block) => block.id.startsWith(`${key}-`) && block.id !== `section-${key}`
  );
  return [...heading, ...entries];
};

const buildMixedBlocks = (skillsFirst: boolean): ContentTemplate["blocks"] => {
  const base = buildDefaultResumeBlocks(templateExample);
  const header = base.filter(
    (block) =>
      block.zone === "header" &&
      (block.id === "person-name" ||
        block.id === "person-headline" ||
        block.id === "person-contact")
  );
  const summary = base.filter(
    (block) => block.id === "section-summary" || block.id === "summary-body"
  );
  const experience = pickSection(base, "experience");
  const skills = pickSection(base, "skills").map((block) =>
    block.zone === "sidebar" || block.zone === "main"
      ? resumeBlockSchema.parse({ ...block, zone: "sidebar" })
      : block
  );
  const education = pickSection(base, "education");
  const openSource = pickSection(base, "projects").map((block) =>
    block.type === "heading" && block.level === 2
      ? resumeBlockSchema.parse({ ...block, text: "Open Source" })
      : block
  );
  const middle = skillsFirst ? [...skills, ...experience] : [...experience, ...skills];
  return withSectionIcons(
    patchBlocks(
      [
        ...header,
        ...summary,
        dividerBlock("row-break-1"),
        ...middle,
        dividerBlock("row-break-2"),
        ...education,
        ...openSource
      ],
      { "skills-list": { columns: 2 } }
    )
  );
};

const buildSkillsSideBlocks = (left: boolean): ContentTemplate["blocks"] => {
  const base = buildDefaultResumeBlocks(templateExample);
  const header = withLeftHeader(base.filter((block) => block.zone === "header"));
  const skills = pickSection(base, "skills").map((block) =>
    resumeBlockSchema.parse({ ...block, zone: "sidebar" })
  );
  const main = ["summary", "experience", "education", "projects"].flatMap((section) =>
    pickSection(base, section)
  );
  const blocks = [...header, ...(left ? [...skills, ...main] : [...main, ...skills])];
  return withSectionIcons(
    left ? blocks : patchBlocks(withCirclePhoto(blocks), { "person-photo": { placement: "right" } })
  );
};

const buildCompactFooterBlocks = (): ContentTemplate["blocks"] => {
  const base = buildDefaultResumeBlocks(templateExample);
  return [
    ...base.filter((block) => block.id === "person-name"),
    ...base
      .filter((block) => block.id === "summary-body")
      .map((block) => resumeBlockSchema.parse({ ...block, zone: "header", align: "left" })),
    ...pickSection(base, "experience"),
    resumeBlockSchema.parse({
      id: "bottom-columns",
      type: "columns",
      zone: "main",
      visible: true,
      columns: [pickSection(base, "education"), pickSection(base, "skills")].map((blocks) => ({
        width: 1,
        blocks
      }))
    }),
    ...base
      .filter((block) => block.id === "person-contact")
      .map((block) => resumeBlockSchema.parse({ ...block, zone: "footer", align: "center" }))
  ];
};

const buildCoursesBlocks = (): ContentTemplate["blocks"] => {
  const base = buildDefaultResumeBlocks(templateExample);
  const rows = [
    ...base.filter((block) => block.zone === "header"),
    ...["summary", "skills", "experience", "education"].flatMap((section) =>
      pickSection(base, section)
    )
  ];
  for (const [index, title] of ["Training & Courses", "Key Achievements", "Interests"].entries()) {
    rows.push(
      resumeBlockSchema.parse({
        id: `paired-heading-${index}`,
        type: "heading",
        level: 2,
        text: title,
        zone: "main",
        visible: true
      })
    );
    const columns: Extract<ResumeBlock, { type: "columns" }>["columns"] = [];
    for (const column of [0, 1]) {
      const blocks: ContentTemplate["blocks"] = [];
      const zone = "main";
      const count = index === 1 ? 2 : 1;
      for (let item = 0; item < count; item += 1) {
        const id = `paired-${index}-${column}-${item}`;
        blocks.push(
          resumeBlockSchema.parse({
            id: `${id}-title`,
            type: "heading",
            level: 3,
            text:
              index === 1 && item === 1
                ? ["Playtest specifications", "Economy dashboard"][column]
                : [
                    ["Game Economy Design", "Accessible Game Interfaces"],
                    ["Tutorial redesign", "Seasonal events"],
                    ["Prototype testing", "Design writing"]
                  ][index][column],
            zone,
            visible: true
          }),
          resumeBlockSchema.parse({
            id: `${id}-description`,
            type: "paragraph",
            text: [
              column === 0
                ? "Example Academy, 2024. Studied reward curves and player progression."
                : "Example Learning, 2023. Practised interface audits and usability testing.",
              item === 0
                ? column === 0
                  ? "Reduced first-session drop-off from 32% to 24% after six playtests."
                  : "Coordinated eight event releases with art, engineering and QA."
                : column === 0
                  ? "Turned playtest findings into a shared set of onboarding specifications."
                  : "Built a dashboard for reviewing reward balance before releases.",
              column === 0
                ? "Hosts monthly playtests for small game prototypes."
                : "Publishes notes on economy balancing and progression design."
            ][index],
            zone,
            visible: true
          })
        );
      }
      columns.push({ width: 1, blocks });
    }
    rows.push(
      resumeBlockSchema.parse({
        id: `paired-columns-${index}`,
        type: "columns",
        zone: "main",
        visible: true,
        columns
      })
    );
  }
  return patchBlocks(
    withCirclePhoto(
      rows.map((block) =>
        block.type === "heading" && block.level > 1
          ? resumeBlockSchema.parse({ ...block, underline: false, bold: false })
          : block
      )
    ),
    {
      "person-photo": { placement: "right" },
      "person-name": { align: "left" },
      "person-headline": { align: "left" },
      "person-contact": { align: "left" }
    }
  );
};

const buildRegionalBlocks = (region: "europe" | "australia"): ContentTemplate["blocks"] => {
  const base = buildDefaultResumeBlocks(templateExample);
  const header = base
    .filter((block) => block.zone === "header")
    .map((block) =>
      block.type === "heading" || block.type === "paragraph"
        ? resumeBlockSchema.parse({ ...block, align: "left" })
        : block
    );
  const order =
    region === "australia"
      ? ["summary", "skills", "experience", "education", "certificates"]
      : ["summary", "experience", "education", "languages", "skills", "certificates"];
  const names: Record<string, string> =
    region === "europe"
      ? {
          summary: "About me",
          experience: "Work experience",
          education: "Education and training",
          languages: "Language skills",
          skills: "Digital and professional skills",
          certificates: "Additional information"
        }
      : {
          summary: "Professional profile",
          skills: "Key skills",
          certificates: "Licences and certifications"
        };
  const blocks = [
    ...header,
    ...order.flatMap((section) =>
      pickSection(base, section).map((block) =>
        block.id === `section-${section}` && block.type === "heading"
          ? resumeBlockSchema.parse({ ...block, text: names[section] ?? block.text })
          : block
      )
    )
  ];
  if (region === "australia")
    blocks.push(
      resumeBlockSchema.parse({
        id: "section-referees",
        type: "heading",
        level: 2,
        text: "Referees",
        zone: "main",
        visible: true
      }),
      resumeBlockSchema.parse({
        id: "referees-text",
        type: "paragraph",
        text: "References available on request.",
        zone: "main",
        visible: true
      })
    );
  return blocks;
};

const useColumnContainers = (template: ContentTemplate): ContentTemplate => {
  if (!template.blocks.some((block) => block.zone === "sidebar")) return template;
  const rows = groupBodyRows(template.blocks).flatMap((row, index): ResumeBlock[] => {
    if (row.kind === "full") return row.blocks;
    const sidebar = { width: 1, blocks: row.sidebarBlocks };
    const main = { width: 2, blocks: row.mainBlocks };
    return [
      {
        id: `columns-row-${index}`,
        type: "columns",
        zone: "main",
        visible: true,
        columns: row.sidebarFirst ? [sidebar, main] : [main, sidebar]
      }
    ];
  });
  return {
    ...template,
    blocks: [
      ...template.blocks.filter((block) => block.zone === "header"),
      ...rows,
      ...template.blocks.filter((block) => block.zone === "footer")
    ]
  };
};

export const builtInContentTemplates: readonly ContentTemplate[] = (
  [
    {
      name: "Compact",
      language: "en",
      blocks: buildClassicCompactBlocks()
    },
    {
      name: "Standard",
      language: "en",
      blocks: withLeftHeader(buildDefaultResumeBlocks(templateExample))
    },
    {
      name: "Two columns",
      language: "en",
      blocks: buildTwoColumnBlocks()
    },
    {
      name: "Centered",
      language: "en",
      blocks: buildCenteredBlocks()
    },
    {
      name: "Split right",
      language: "en",
      blocks: buildMixedBlocks(false)
    },
    {
      name: "Split left",
      language: "en",
      blocks: buildMixedBlocks(true)
    },
    {
      name: "Photo",
      language: "en",
      blocks: patchBlocks(withCirclePhoto(buildCenteredBlocks()), {
        "person-photo": { placement: "above" }
      })
    },
    { name: "Skills left", language: "en", blocks: buildSkillsSideBlocks(true) },
    { name: "Skills right", language: "en", blocks: buildSkillsSideBlocks(false) },
    { name: "Compact with footer", language: "en", blocks: buildCompactFooterBlocks() },
    { name: "Courses", language: "en", blocks: buildCoursesBlocks() },
    { name: "Europe", language: "en", blocks: buildRegionalBlocks("europe") },
    { name: "Australia", language: "en", blocks: buildRegionalBlocks("australia") },
    { name: "Japan", language: "ja", blocks: japaneseTemplateBlocks(placeholderPhoto) },
    {
      name: "Minimal",
      language: "en",
      blocks: withLeftHeader(buildDefaultResumeBlocks(templateExample))
        .filter(
          (block) =>
            block.zone === "header" ||
            ["summary", "experience", "education", "skills", "projects"].some(
              (section) => block.id === `section-${section}` || block.id.startsWith(`${section}-`)
            )
        )
        .map((block) =>
          block.type === "heading" && block.level === 2
            ? resumeBlockSchema.parse({ ...block, underline: false, bold: false })
            : block
        )
    }
  ] satisfies ContentTemplate[]
).map(useColumnContainers);

export const createResumeFromContentTemplate = (template: ContentTemplate): Resume => {
  const validated = contentTemplateSchema.parse(template);
  const nameBlock = flattenResumeBlocks(validated.blocks).find(
    (block) => block.type === "heading" && block.level === 1 && block.zone === "header"
  );

  return resumeSchema.parse({
    language: validated.language,
    layout: validated.blocks.some((block) => block.zone === "sidebar" || block.type === "columns")
      ? "two-column"
      : "one-column",
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

import {
  resumeBlockSchema,
  type Resume,
  type ResumeBlock,
  type ResumeEntry,
  type ResumeZone
} from "./schema";

const imageBlock = (
  id: string,
  src: string,
  alt: string,
  zone: ResumeZone,
  width?: number,
  height?: number
): ResumeBlock => ({
  id,
  type: "image",
  zone,
  src,
  alt,
  width,
  height,
  visible: true,
  textLinks: []
});

type SectionKey =
  | "summary"
  | "experience"
  | "education"
  | "projects"
  | "skills"
  | "languages"
  | "certificates";

const sectionTitles: Record<Resume["language"], Record<SectionKey, string>> = {
  ja: {
    summary: "自己紹介",
    experience: "職歴",
    education: "学歴",
    projects: "プロジェクト",
    skills: "スキル",
    languages: "語学",
    certificates: "免許・資格"
  },
  en: {
    summary: "Summary",
    experience: "Experience",
    education: "Education",
    projects: "Projects",
    skills: "Skills",
    languages: "Languages",
    certificates: "Certificates"
  },
  ru: {
    summary: "О себе",
    experience: "Опыт",
    education: "Образование",
    projects: "Проекты",
    skills: "Навыки",
    languages: "Языки",
    certificates: "Сертификаты"
  }
};

const visible = true;
const mainZone: ResumeZone = "main";

const headingBlock = (
  id: string,
  text: string,
  level: 1 | 2 | 3,
  zone: ResumeZone
): ResumeBlock => ({
  id,
  type: "heading",
  zone,
  level,
  text,
  visible
});

const paragraphBlock = (id: string, text: string, zone: ResumeZone): ResumeBlock => ({
  id,
  type: "paragraph",
  zone,
  text,
  visible
});

const bulletListBlock = (id: string, items: string[], zone: ResumeZone): ResumeBlock => ({
  id,
  type: "bullet_list",
  zone,
  items,
  visible
});

const entryBlock = (id: string, entry: ResumeEntry, zone: ResumeZone): ResumeBlock => ({
  id,
  type: "entry",
  zone,
  entry,
  visible
});

const sectionHeading = (resume: Resume, key: SectionKey): ResumeBlock =>
  headingBlock(`section-${key}`, sectionTitles[resume.language][key], 2, mainZone);

const contactLine = (resume: Resume) => {
  const contactItems = [
    resume.person.email,
    resume.person.phone,
    resume.person.location,
    ...resume.person.links.map((link) => link.label)
  ].filter(Boolean);

  return contactItems.length > 0 ? contactItems.join(" · ") : undefined;
};

const addEntrySection = (
  blocks: ResumeBlock[],
  resume: Resume,
  key: Extract<SectionKey, "experience" | "education" | "projects" | "certificates">,
  entries: ResumeEntry[]
) => {
  if (entries.length === 0) {
    return;
  }

  blocks.push(sectionHeading(resume, key));
  entries.forEach((entry, index) => {
    blocks.push(entryBlock(`${key}-${index}`, entry, mainZone));
  });
};

export const buildDefaultResumeBlocks = (resume: Resume): ResumeBlock[] => {
  const blocks: ResumeBlock[] = [headingBlock("person-name", resume.person.fullName, 1, "header")];

  if (resume.person.photo) {
    blocks.push(
      imageBlock("person-photo", resume.person.photo, resume.person.fullName, "header", 120, 150)
    );
  }

  const contact = contactLine(resume);

  if (resume.person.headline) {
    blocks.push(paragraphBlock("person-headline", resume.person.headline, "header"));
  }

  if (contact) {
    blocks.push(paragraphBlock("person-contact", contact, "header"));
  }

  if (resume.summary) {
    blocks.push(sectionHeading(resume, "summary"));
    blocks.push(paragraphBlock("summary-body", resume.summary, mainZone));
  }

  addEntrySection(blocks, resume, "experience", resume.experience);
  addEntrySection(blocks, resume, "education", resume.education);
  addEntrySection(blocks, resume, "projects", resume.projects);

  if (resume.skills.length > 0) {
    blocks.push(sectionHeading(resume, "skills"));
    blocks.push(
      bulletListBlock(
        "skills-list",
        resume.skills.map((skillGroup) =>
          skillGroup.group
            ? `${skillGroup.group}: ${skillGroup.items.join(", ")}`
            : skillGroup.items.join(", ")
        ),
        mainZone
      )
    );
  }

  if (resume.languages.length > 0) {
    blocks.push(sectionHeading(resume, "languages"));
    blocks.push(
      bulletListBlock(
        "languages-list",
        resume.languages.map((language) =>
          language.level ? `${language.name}: ${language.level}` : language.name
        ),
        mainZone
      )
    );
  }

  addEntrySection(blocks, resume, "certificates", resume.certificates);

  resume.customSections.forEach((section, sectionIndex) => {
    blocks.push(headingBlock(`custom-${sectionIndex}`, section.title, 2, mainZone));
    section.items.forEach((item, itemIndex) => {
      blocks.push(
        typeof item === "string"
          ? paragraphBlock(`custom-${sectionIndex}-${itemIndex}`, item, mainZone)
          : entryBlock(`custom-${sectionIndex}-${itemIndex}`, item, mainZone)
      );
    });
  });

  return blocks.map((block) => resumeBlockSchema.parse(block));
};

export const getResumeBlocks = (resume: Resume): ResumeBlock[] =>
  resume.layoutBlocks.length > 0 ? resume.layoutBlocks : buildDefaultResumeBlocks(resume);

export const getHeadingPresentation = (block: Extract<ResumeBlock, { type: "heading" }>) => ({
  underline: block.underline ?? block.level === 2,
  uppercase: block.uppercase ?? block.level === 2,
  bold: block.bold ?? true
});

export type BodyRow =
  | { kind: "full"; blocks: ResumeBlock[] }
  | {
      kind: "mixed";
      sidebarBlocks: ResumeBlock[];
      mainBlocks: ResumeBlock[];
      sidebarFirst: boolean;
    };

const isBodyZone = (block: ResumeBlock) => block.zone === "sidebar" || block.zone === "main";

// Groups visible body blocks (sidebar + main, document order) into render rows for the
// single A4 renderer. Rule: a body that contains sidebar blocks is split into sections
// on divider blocks — the dividers are consumed as row separators and are not rendered.
// A section with both zones becomes one mixed row (column order follows the first block);
// a single-zone section becomes full-width rows. Bodies without sidebar blocks render
// exactly as before, dividers included.
export const groupBodyRows = (blocks: ResumeBlock[], forEditing = false): BodyRow[] => {
  const body = blocks.filter((block) => (block.visible || forEditing) && isBodyZone(block));
  if (!body.some((block) => block.zone === "sidebar")) {
    return body.length > 0 ? [{ kind: "full", blocks: body }] : [];
  }
  const sections: ResumeBlock[][] = [[]];
  for (const block of body) {
    if (block.type === "divider") {
      if (forEditing) sections.push([block]);
      sections.push([]);
      continue;
    }
    sections[sections.length - 1]?.push(block);
  }
  return sections.flatMap((section): BodyRow[] => {
    if (section.length === 0) return [];
    const sidebarBlocks = section.filter((block) => block.zone === "sidebar");
    const mainBlocks = section.filter((block) => block.zone === "main");
    if (sidebarBlocks.length > 0 && mainBlocks.length > 0) {
      return [
        {
          kind: "mixed",
          sidebarBlocks,
          mainBlocks,
          sidebarFirst: section[0]?.zone !== "main"
        }
      ];
    }
    return [{ kind: "full", blocks: section }];
  });
};

// Containers retain their own layout; their descendants follow column reading order.
export const flattenResumeBlocks = (
  blocks: ResumeBlock[],
  includeHidden = false,
  inheritedZone?: ResumeZone
): ResumeBlock[] =>
  blocks
    .filter((block) => includeHidden || block.visible)
    .flatMap((block) =>
      block.type === "columns"
        ? block.columns.flatMap((column) =>
            flattenResumeBlocks(column.blocks, includeHidden, inheritedZone ?? block.zone)
          )
        : [inheritedZone ? { ...block, zone: inheritedZone } : block]
    );

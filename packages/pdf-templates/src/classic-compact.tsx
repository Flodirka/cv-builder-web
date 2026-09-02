import { Fragment, type ReactNode } from "react";
import styles from "./classic-compact.module.css";
import {
  getResumeBlocks,
  toSafeHttpUrl,
  type Resume,
  type ResumeBlock,
  type ResumeEntry,
  type ResumeLink
} from "@cv-builder/resume-core";

const printableZones = new Set(["header", "main", "footer"]);

export type A4DocumentModel = {
  blocks: ResumeBlock[];
};

export type ResumePrintDocumentProps = {
  resume: Resume;
  title?: string;
};

export const createA4DocumentModel = (resume: Resume): A4DocumentModel => ({
  blocks: getResumeBlocks(resume).filter((block) => printableZones.has(block.zone))
});

const visibleBlocks = (blocks: ResumeBlock[], zone: ResumeBlock["zone"]) =>
  blocks.filter((block) => block.visible && block.zone === zone);

const entryDate = (entry: ResumeEntry) => [entry.start, entry.end].filter(Boolean).join(" - ");

const LinkedText = ({ text, links = [] }: { text: string; links?: ResumeLink[] }) => {
  const ranges = links
    .flatMap((link) => {
      const href = toSafeHttpUrl(link.url);
      if (!href || !link.label) return [];

      const matches: Array<{ start: number; end: number; href: string }> = [];
      let offset = 0;
      while (offset < text.length) {
        const start = text.indexOf(link.label, offset);
        if (start === -1) break;
        matches.push({ start, end: start + link.label.length, href });
        offset = start + link.label.length;
      }
      return matches;
    })
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .filter((range, index, allRanges) =>
      allRanges.slice(0, index).every((previous) => previous.end <= range.start)
    );

  if (ranges.length === 0) return text;

  const content: ReactNode[] = [];
  let offset = 0;
  ranges.forEach((range, index) => {
    if (range.start > offset) content.push(text.slice(offset, range.start));
    content.push(
      <a className={styles.inlineLink} href={range.href} key={`${range.href}-${index}`}>
        {text.slice(range.start, range.end)}
      </a>
    );
    offset = range.end;
  });
  if (offset < text.length) content.push(text.slice(offset));

  return <Fragment>{content}</Fragment>;
};

const EntryBlock = ({ entry }: { entry: ResumeEntry }) => {
  const primary = entry.title;
  const secondary = entry.subtitle ?? entry.description;
  const date = entryDate(entry);

  return (
    <article className={styles.entry}>
      <div className={styles.entryTopline}>
        <strong className={styles.entryPrimary}>
          <LinkedText links={entry.links} text={primary} />
        </strong>
        {entry.location ? (
          <strong className={styles.entryLocation}>
            <LinkedText links={entry.links} text={entry.location} />
          </strong>
        ) : null}
      </div>

      {(secondary || date) && (
        <div className={styles.entrySubline}>
          {secondary ? (
            <span className={styles.entrySecondary}>
              <LinkedText links={entry.links} text={secondary} />
            </span>
          ) : (
            <span />
          )}
          {date ? (
            <span className={styles.entryDate}>
              <LinkedText links={entry.links} text={date} />
            </span>
          ) : null}
        </div>
      )}

      {entry.description && entry.subtitle ? (
        <p className={styles.entryDescription}>
          <LinkedText links={entry.links} text={entry.description} />
        </p>
      ) : null}

      {entry.bullets.length > 0 ? (
        <ul className={styles.bullets}>
          {entry.bullets.map((bullet) => (
            <li key={bullet}>
              <LinkedText links={entry.links} text={bullet} />
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
};

const Block = ({ block }: { block: ResumeBlock }) => {
  switch (block.type) {
    case "heading": {
      const HeadingTag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
      return (
        <HeadingTag className={`${styles.heading} ${styles[`headingLevel${block.level}`]}`}>
          <LinkedText links={block.textLinks} text={block.text} />
        </HeadingTag>
      );
    }
    case "paragraph":
      return (
        <p className={styles.paragraph}>
          <LinkedText links={block.textLinks} text={block.text} />
        </p>
      );
    case "labeled_text":
      return (
        <p className={styles.labeledText}>
          <strong>
            <LinkedText links={block.textLinks} text={block.label} />:
          </strong>{" "}
          <LinkedText links={block.textLinks} text={block.text} />
        </p>
      );
    case "bullet_list":
      return (
        <ul className={styles.bullets}>
          {block.items.map((item) => (
            <li key={item}>
              <LinkedText links={block.textLinks} text={item} />
            </li>
          ))}
        </ul>
      );
    case "divider":
      return <hr className={styles.divider} />;
    case "spacer":
      return (
        <div aria-hidden="true" className={`${styles.spacer} ${styles[`spacer-${block.size}`]}`} />
      );
    case "entry":
      return <EntryBlock entry={block.entry} />;
  }
};

export const ResumePrintDocument = ({ resume, title }: ResumePrintDocumentProps) => {
  const model = createA4DocumentModel(resume);
  const headerBlocks = visibleBlocks(model.blocks, "header");
  const mainBlocks = visibleBlocks(model.blocks, "main");
  const footerBlocks = visibleBlocks(model.blocks, "footer");

  return (
    <article className={styles.page} aria-label={title ?? `${resume.person.fullName} CV`}>
      <header className={styles.header}>
        {headerBlocks.map((block) => (
          <Block block={block} key={block.id} />
        ))}
      </header>

      <main className={styles.main}>
        {mainBlocks.map((block) => (
          <Block block={block} key={block.id} />
        ))}
      </main>

      {footerBlocks.length > 0 ? (
        <footer className={styles.footer}>
          {footerBlocks.map((block) => (
            <Block block={block} key={block.id} />
          ))}
        </footer>
      ) : null}
    </article>
  );
};

import { Fragment, type ReactNode } from "react";
import styles from "./a4-preview.module.css";
import {
  getResumeBlocks,
  groupBodyRows,
  getHeadingPresentation,
  toSafeHttpUrl,
  toSafeImageUrl,
  type BlockAlign,
  type Resume,
  type ResumeBlock,
  type ResumeEntry,
  type ResumeLink
} from "@cv-builder/resume-core";
import { ResumeIconSvg } from "./resume-icon-svg";

const alignClass = (align?: BlockAlign) => (align ? styles[`align-${align}`] : "");

const printableZones = new Set(["header", "sidebar", "main", "footer"]);

export type A4DocumentModel = {
  blocks: ResumeBlock[];
  layout: Resume["layout"];
};

export type A4PreviewDocumentProps = {
  resume: Resume;
  title?: string;
};

export const createA4DocumentModel = (resume: Resume): A4DocumentModel => ({
  blocks: getResumeBlocks(resume).filter((block) => printableZones.has(block.zone)),
  layout: resume.layout
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
    case "page_break":
      return <div aria-label="Page break" className={styles.pageBreak} />;
    case "table":
      return (
        <table style={{ textAlign: block.align ?? "left" }} className={styles.table}>
          <colgroup>
            {block.widths.map((width, index) => (
              <col
                key={index}
                style={{
                  width: `${(width / block.widths.reduce((sum, value) => sum + value, 0)) * 100}%`
                }}
              />
            ))}
          </colgroup>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) =>
                  block.header && rowIndex === 0 ? (
                    <th scope="col" key={cellIndex}>
                      {cell}
                    </th>
                  ) : (
                    <td key={cellIndex}>{cell}</td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "columns":
      return (
        <div
          className={styles.columnsBlock}
          style={{
            gridTemplateColumns: block.columns
              .map((column) => `minmax(0, ${column.width}fr)`)
              .join(" ")
          }}
        >
          {block.columns.map((column, index) => (
            <div key={index}>
              {column.blocks
                .filter((child) => child.visible)
                .map((child) => (
                  <Block key={child.id} block={child} />
                ))}
            </div>
          ))}
        </div>
      );
    case "heading": {
      const presentation = getHeadingPresentation(block);
      const HeadingTag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
      return (
        <HeadingTag
          style={{
            borderBottom: presentation.underline ? "1px solid #000" : "none",
            textTransform: presentation.uppercase ? "uppercase" : "none",
            fontWeight: presentation.bold ? 700 : 400
          }}
          className={`${styles.heading} ${styles[`headingLevel${block.level}`]} ${alignClass(block.align)}`}
        >
          <ResumeIconSvg icon={block.icon} className={styles.headingIcon} />
          <LinkedText links={block.textLinks} text={block.text} />
        </HeadingTag>
      );
    }
    case "paragraph":
      return (
        <p className={`${styles.paragraph} ${alignClass(block.align)}`}>
          <LinkedText links={block.textLinks} text={block.text} />
        </p>
      );
    case "labeled_text":
      return (
        <p className={`${styles.labeledText} ${alignClass(block.align)}`}>
          <strong>
            <LinkedText links={block.textLinks} text={block.label} />:
          </strong>{" "}
          <LinkedText links={block.textLinks} text={block.text} />
        </p>
      );
    case "bullet_list":
      return (
        <ul
          style={
            block.columns === 2
              ? { gridTemplateRows: `repeat(${Math.ceil(block.items.length / 2)}, auto)` }
              : undefined
          }
          className={`${styles.bullets} ${alignClass(block.align)} ${
            block.columns === 2 ? styles["bullets--columns-2"] : ""
          }`}
        >
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
    case "image": {
      const src = toSafeImageUrl(block.src);
      if (!src) return null;
      const inlineStyle: React.CSSProperties = {};
      if (block.width) inlineStyle.width = `${block.width}px`;
      if (block.height) inlineStyle.height = `${block.height}px`;
      const shapeClass =
        block.shape && block.shape !== "square" ? styles[`imageBlock--shape-${block.shape}`] : "";
      return (
        <img
          className={`${styles.imageBlock} ${block.width && block.height ? styles["imageBlock--sized"] : ""} ${shapeClass}`}
          src={src}
          alt={block.alt}
          style={inlineStyle}
        />
      );
    }
  }
};

export const A4PreviewDocument = ({ resume, title }: A4PreviewDocumentProps) => {
  const model = createA4DocumentModel(resume);
  const headerBlocks = visibleBlocks(model.blocks, "header");
  const footerBlocks = visibleBlocks(model.blocks, "footer");
  const bodyRows = groupBodyRows(model.blocks);
  const headerPhoto = headerBlocks.find((block) => block.type === "image");
  const headerTextBlocks = headerBlocks.filter((block) => block.id !== headerPhoto?.id);
  const hasProfileHeader = headerPhoto !== undefined && headerTextBlocks.length > 0;

  return (
    <article
      lang={resume.language}
      className={`${styles.page} ${resume.language === "ja" ? styles.japanese : ""}`}
      aria-label={title ?? `${resume.person.fullName} CV`}
    >
      <header className={`${styles.header} ${hasProfileHeader ? styles["header--profile"] : ""}`}>
        {hasProfileHeader ? (
          <div
            className={`${styles.profileHeaderIdentity} ${headerPhoto.type === "image" && headerPhoto.placement ? styles[`profileHeaderIdentity--${headerPhoto.placement}`] : ""}`}
          >
            <Block block={headerPhoto} />
            <div className={styles.profileHeaderText}>
              {headerTextBlocks.map((block) => (
                <Block block={block} key={block.id} />
              ))}
            </div>
          </div>
        ) : (
          headerBlocks.map((block) => <Block block={block} key={block.id} />)
        )}
      </header>

      <main className={styles.main}>
        {bodyRows.map((row, index) => {
          if (row.kind === "full") {
            return (
              <div className={styles.bodyRow} key={`row-${index}`}>
                {row.blocks.map((block) => (
                  <Block block={block} key={block.id} />
                ))}
              </div>
            );
          }
          const sidebar = (
            <aside className={styles.sidebar} key="sidebar">
              {row.sidebarBlocks.map((block) => (
                <Block block={block} key={block.id} />
              ))}
            </aside>
          );
          const main = (
            <div className={styles.bodyMain} key="main">
              {row.mainBlocks.map((block) => (
                <Block block={block} key={block.id} />
              ))}
            </div>
          );
          return (
            <div
              className={`${styles["bodyRow--mixed"]} ${row.sidebarFirst ? "" : styles["bodyRow--mixed-flip"]}`}
              key={`row-${index}`}
            >
              {row.sidebarFirst ? [sidebar, main] : [main, sidebar]}
            </div>
          );
        })}
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

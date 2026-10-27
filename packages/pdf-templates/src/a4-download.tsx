import {
  Circle,
  Document,
  Ellipse,
  Font,
  Image,
  Link,
  Line,
  Page,
  Path,
  Polygon,
  Polyline,
  pdf,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View
} from "@react-pdf/renderer";
import { createElement, Fragment, type ElementType } from "react";
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
import { resumeIconDrawing, type ResumeIconNode } from "./resume-icon-paths";

const pdfIconElements: Record<ResumeIconNode["tag"], ElementType> = {
  path: Path,
  circle: Circle,
  ellipse: Ellipse,
  rect: Rect,
  line: Line,
  polygon: Polygon,
  polyline: Polyline
};

export type A4DownloadDocumentProps = {
  fontBaseUrl: string;
  resume: Resume;
};

const fontFamily = "PT Serif CV Builder";
const japaneseFontFamily = "Zen Kaku Gothic CV Builder";
const registeredFontRoots = new Set<string>();

const registerFonts = (fontBaseUrl: string) => {
  const root = fontBaseUrl.endsWith("/") ? fontBaseUrl : `${fontBaseUrl}/`;
  if (registeredFontRoots.has(root)) return;

  Font.register({
    family: fontFamily,
    fonts: [
      { src: `${root}PT_Serif-Web-Regular.ttf`, fontStyle: "normal", fontWeight: 400 },
      { src: `${root}PT_Serif-Web-Bold.ttf`, fontStyle: "normal", fontWeight: 700 },
      { src: `${root}PT_Serif-Web-Italic.ttf`, fontStyle: "italic", fontWeight: 400 },
      { src: `${root}PT_Serif-Web-BoldItalic.ttf`, fontStyle: "italic", fontWeight: 700 }
    ]
  });
  Font.register({
    family: japaneseFontFamily,
    fonts: [
      { src: `${root}ZenKakuGothicNew-Regular.ttf`, fontWeight: 400 },
      { src: `${root}ZenKakuGothicNew-Bold.ttf`, fontWeight: 700 },
      { src: `${root}ZenKakuGothicNew-Regular.ttf`, fontWeight: 400, fontStyle: "italic" },
      { src: `${root}ZenKakuGothicNew-Bold.ttf`, fontWeight: 700, fontStyle: "italic" }
    ]
  });
  registeredFontRoots.add(root);
};

Font.registerHyphenationCallback((word) =>
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word) ? Array.from(word) : [word]
);

const styles = StyleSheet.create({
  page: {
    padding: 30,
    backgroundColor: "#ffffff",
    color: "#000000",
    fontFamily,
    fontSize: 8.25,
    lineHeight: 1.16
  },
  header: { marginBottom: 8.25, textAlign: "center" },
  profileHeaderIdentity: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 10.5,
    marginBottom: 6,
    textAlign: "left"
  },
  profileHeaderText: { flexGrow: 1, flexShrink: 1, textAlign: "left" },
  footer: { marginTop: 9, fontSize: 7.5, textAlign: "center" },
  contentRow: {
    display: "flex",
    flexDirection: "row",
    gap: 18,
    marginBottom: 6
  },
  sidebarColumn: {
    width: 135,
    flexShrink: 0
  },
  mainColumn: {
    flexGrow: 1,
    flexShrink: 1
  },
  nestedColumn: { flexShrink: 1, flexBasis: 0, minWidth: 0 },
  heading1: {
    marginBottom: 3.75,
    fontSize: 13.5,
    fontWeight: 700,
    lineHeight: 1.05
  },
  heading2: {
    marginTop: 6.75,
    marginBottom: 3.75,
    borderBottomColor: "#000000",
    borderBottomWidth: 0.75,
    fontSize: 8.25,
    fontWeight: 700,
    lineHeight: 1.12,
    textTransform: "uppercase"
  },
  heading3: {
    marginTop: 5.25,
    marginBottom: 3,
    fontSize: 7.5,
    fontWeight: 700,
    lineHeight: 1.12
  },
  headingRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  paragraph: { marginBottom: 4.5 },
  labeledText: { marginBottom: 3 },
  labeledPrefix: { fontWeight: 700 },
  inlineLink: {
    color: "#000000",
    textDecoration: "underline"
  },
  entry: { marginBottom: 6 },
  entryRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12
  },
  entrySubline: { marginTop: 1.5 },
  entryPrimary: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 8.25,
    fontWeight: 700,
    textTransform: "uppercase"
  },
  entryLocation: {
    flexShrink: 0,
    fontSize: 8.25,
    fontWeight: 700,
    textAlign: "right",
    textTransform: "uppercase"
  },
  entrySecondary: { flexGrow: 1, flexShrink: 1, fontStyle: "italic" },
  entryDate: { flexShrink: 0, fontStyle: "italic", textAlign: "right" },
  entryDescription: { marginTop: 2.25, fontStyle: "italic" },
  bullets: { marginTop: 3 },
  bulletRow: { display: "flex", flexDirection: "row", marginBottom: 1.5 },
  bullet: { width: 13.5, paddingLeft: 3, flexShrink: 0 },
  bulletText: { flexGrow: 1, flexShrink: 1 },
  bulletColumns: {
    display: "flex",
    flexDirection: "row",
    gap: 12
  },
  bulletColumn: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1
  },
  divider: {
    height: 0.75,
    marginTop: 5.25,
    marginBottom: 5.25,
    backgroundColor: "#000000"
  },
  spacerXs: { height: 2.25 },
  spacerSm: { height: 4.5 },
  spacerMd: { height: 7.5 },
  spacerLg: { height: 12 },
  imageBlock: {
    maxWidth: "100%",
    height: "auto"
  },
  imageBlockRounded: {
    borderRadius: 9
  },
  imageBlockCircle: {
    borderRadius: 999
  }
});

const alignStyle = (align?: BlockAlign): PdfAlignStyle =>
  !align
    ? {}
    : align === "center"
      ? { textAlign: "center" }
      : align === "right"
        ? { textAlign: "right" }
        : { textAlign: "left" };

const alignRowStyle = (align?: BlockAlign) =>
  align === "center"
    ? { justifyContent: "center" as const }
    : align === "right"
      ? { justifyContent: "flex-end" as const }
      : { justifyContent: "flex-start" as const };

const spacerStyles = {
  xs: styles.spacerXs,
  sm: styles.spacerSm,
  md: styles.spacerMd,
  lg: styles.spacerLg
};

type PdfAlignStyle = { textAlign?: "left" | "center" | "right" };

type PdfStyle = (typeof styles)[keyof typeof styles] | PdfAlignStyle;

const linkedRanges = (text: string, links: ResumeLink[]) =>
  links
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

const LinkedText = ({
  links = [],
  style,
  text
}: {
  links?: ResumeLink[];
  style?: PdfStyle | PdfStyle[];
  text: string;
}) => {
  const ranges = linkedRanges(text, links);
  if (ranges.length === 0) return <Text style={style}>{text}</Text>;

  return (
    <Text style={style}>
      {ranges.map((range, index) => {
        const prefix = text.slice(index === 0 ? 0 : ranges[index - 1].end, range.start);
        const label = text.slice(range.start, range.end);
        return (
          <Text key={`${range.href}-${index}`}>
            {prefix}
            <Link src={range.href} style={styles.inlineLink}>
              {label}
            </Link>
          </Text>
        );
      })}
      {text.slice(ranges.at(-1)?.end ?? 0)}
    </Text>
  );
};

const BulletList = ({
  items,
  links = [],
  align,
  columns
}: {
  items: string[];
  links?: ResumeLink[];
  align?: BlockAlign;
  columns?: 1 | 2;
}) => {
  const renderItems = (entries: Array<{ item: string; index: number }>) => (
    <>
      {entries.map(({ item, index }) => (
        <View key={`${item}-${index}`} style={styles.bulletRow}>
          <Text style={styles.bullet}>•</Text>
          <LinkedText links={links} style={[styles.bulletText, alignStyle(align)]} text={item} />
        </View>
      ))}
    </>
  );
  if (columns !== 2) {
    return (
      <View style={styles.bullets}>
        {renderItems(items.map((item, index) => ({ item, index })))}
      </View>
    );
  }
  const midpoint = Math.ceil(items.length / 2);
  return (
    <View style={styles.bullets}>
      <View style={styles.bulletColumns}>
        <View style={styles.bulletColumn}>
          {renderItems(items.slice(0, midpoint).map((item, index) => ({ item, index })))}
        </View>
        <View style={styles.bulletColumn}>
          {renderItems(
            items.slice(midpoint).map((item, index) => ({ item, index: index + midpoint }))
          )}
        </View>
      </View>
    </View>
  );
};

const EntryBlock = ({ entry }: { entry: ResumeEntry }) => {
  const secondary = entry.subtitle ?? entry.description;
  const date = [entry.start, entry.end].filter(Boolean).join(" - ");

  return (
    <View style={styles.entry} wrap={false}>
      <View style={styles.entryRow}>
        <LinkedText links={entry.links} style={styles.entryPrimary} text={entry.title} />
        {entry.location ? (
          <LinkedText links={entry.links} style={styles.entryLocation} text={entry.location} />
        ) : null}
      </View>

      {secondary || date ? (
        <View style={[styles.entryRow, styles.entrySubline]}>
          <LinkedText links={entry.links} style={styles.entrySecondary} text={secondary ?? ""} />
          {date ? <LinkedText links={entry.links} style={styles.entryDate} text={date} /> : null}
        </View>
      ) : null}

      {entry.description && entry.subtitle ? (
        <LinkedText links={entry.links} style={styles.entryDescription} text={entry.description} />
      ) : null}

      {entry.bullets.length > 0 ? <BulletList items={entry.bullets} links={entry.links} /> : null}
    </View>
  );
};

const Block = ({ block }: { block: ResumeBlock }) => {
  switch (block.type) {
    case "page_break":
      return <View break style={{ height: 0.1 }} />;
    case "table":
      return (
        <View style={{ marginBottom: 6 }}>
          {block.rows.map((row, rowIndex) => (
            <View key={rowIndex} wrap={false} style={{ flexDirection: "row" }}>
              {row.map((cell, cellIndex) => (
                <View
                  key={cellIndex}
                  style={{
                    flexBasis: 0,
                    flexGrow: block.widths[cellIndex],
                    minWidth: 0,
                    borderWidth: 0.5,
                    borderColor: "#000000",
                    padding: 4.5,
                    marginTop: rowIndex > 0 ? -0.5 : 0,
                    marginLeft: cellIndex > 0 ? -0.5 : 0
                  }}
                >
                  <Text
                    style={{
                      fontWeight: block.header && rowIndex === 0 ? 700 : 400,
                      textAlign: block.align ?? "left"
                    }}
                  >
                    {cell || " "}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    case "columns":
      return (
        <View style={styles.contentRow}>
          {block.columns.map((column, index) => (
            <View key={index} style={[styles.nestedColumn, { flexGrow: column.width }]}>
              <ZoneBlocks blocks={column.blocks} />
            </View>
          ))}
        </View>
      );
    case "heading": {
      const presentation = getHeadingPresentation(block);
      const headingStyle = {
        borderBottomWidth: presentation.underline ? 0.75 : 0,
        borderBottomColor: "#000000",
        textTransform: presentation.uppercase ? ("uppercase" as const) : ("none" as const),
        fontWeight: presentation.bold ? 700 : 400
      };
      const drawing = resumeIconDrawing(block.icon);
      if (!drawing) {
        return (
          <LinkedText
            links={block.textLinks}
            style={[styles[`heading${block.level}`], headingStyle, alignStyle(block.align)]}
            text={block.text}
          />
        );
      }
      return (
        <View
          style={[
            styles[`heading${block.level}`],
            headingStyle,
            styles.headingRow,
            alignRowStyle(block.align)
          ]}
        >
          <Svg
            style={{
              width: styles[`heading${block.level}`].fontSize,
              height: styles[`heading${block.level}`].fontSize
            }}
            viewBox="0 0 24 24"
            fill={drawing.outline ? "none" : "#000000"}
            stroke={drawing.outline ? "#000000" : "none"}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {drawing.nodes.map((node, index) =>
              createElement(pdfIconElements[node.tag], {
                ...node.props,
                key: index,
                // React PDF normalizes "none" on children before inheriting root paints.
                fill:
                  node.props.fill === "currentColor"
                    ? "#000000"
                    : (node.props.fill ?? (drawing.outline ? "none" : "#000000")),
                stroke:
                  node.props.stroke === "currentColor"
                    ? "#000000"
                    : (node.props.stroke ?? (drawing.outline ? "#000000" : "none"))
              })
            )}
          </Svg>
          <LinkedText links={block.textLinks} text={block.text} />
        </View>
      );
    }
    case "paragraph":
      return (
        <LinkedText
          links={block.textLinks}
          style={[styles.paragraph, alignStyle(block.align)]}
          text={block.text}
        />
      );
    case "labeled_text":
      return (
        <Text style={[styles.labeledText, alignStyle(block.align)]}>
          <LinkedText links={block.textLinks} style={styles.labeledPrefix} text={block.label} />:{" "}
          <LinkedText links={block.textLinks} text={block.text} />
        </Text>
      );
    case "bullet_list":
      return (
        <BulletList
          items={block.items}
          links={block.textLinks}
          align={block.align}
          columns={block.columns}
        />
      );
    case "divider":
      return <View style={styles.divider} />;
    case "spacer":
      return <View style={spacerStyles[block.size]} />;
    case "entry":
      return <EntryBlock entry={block.entry} />;
    case "image": {
      const src = toSafeImageUrl(block.src);
      if (!src) return null;
      return (
        <Image
          src={src}
          style={[
            styles.imageBlock,
            ...(block.shape === "rounded" ? [styles.imageBlockRounded] : []),
            ...(block.shape === "circle" ? [styles.imageBlockCircle] : []),
            ...(block.width ? [{ width: block.width * 0.75 }] : []),
            ...(block.height ? [{ height: block.height * 0.75 }] : []),
            ...(block.width && block.height ? [{ objectFit: "cover" as const }] : [])
          ]}
        />
      );
    }
  }
};

const visibleZoneBlocks = (resume: Resume, zone: ResumeBlock["zone"]) => {
  const blocks = getResumeBlocks(resume).filter((block) => block.visible && block.zone === zone);
  return blocks.filter((block, index) => {
    if (block.type !== "divider") return true;
    const previous = blocks[index - 1];
    return previous?.type !== "heading" || previous.level !== 2;
  });
};

const ZoneBlocks = ({ blocks }: { blocks: ResumeBlock[] }) => (
  <>
    {blocks
      .filter(
        (block, index) =>
          block.type !== "divider" ||
          blocks[index - 1]?.type !== "heading" ||
          (blocks[index - 1] as Extract<ResumeBlock, { type: "heading" }>).level !== 2
      )
      .map((block) => (
        <Block block={block} key={block.id} />
      ))}
  </>
);

export const A4DownloadDocument = ({ fontBaseUrl, resume }: A4DownloadDocumentProps) => {
  registerFonts(fontBaseUrl);
  const headerBlocks = visibleZoneBlocks(resume, "header");
  const footerBlocks = visibleZoneBlocks(resume, "footer");
  const bodyBlocks = getResumeBlocks(resume).filter(
    (block) => block.visible && (block.zone === "sidebar" || block.zone === "main")
  );
  const bodyRows = groupBodyRows(bodyBlocks);
  const headerPhoto = headerBlocks.find((block) => block.type === "image");
  const headerTextBlocks = headerBlocks.filter((block) => block.id !== headerPhoto?.id);
  const hasProfileHeader = headerPhoto !== undefined && headerTextBlocks.length > 0;

  return (
    <Document
      author={resume.person.fullName}
      language={resume.language}
      subject="Resume"
      title={`${resume.person.fullName} CV`}
    >
      <Page
        size="A4"
        style={[
          styles.page,
          ...(resume.language === "ja"
            ? [{ fontFamily: japaneseFontFamily, fontSize: 10, lineHeight: 1.45 }]
            : [])
        ]}
      >
        <View style={styles.header}>
          {hasProfileHeader ? (
            <View
              style={[
                styles.profileHeaderIdentity,
                ...(headerPhoto.type === "image" && headerPhoto.placement === "right"
                  ? [{ flexDirection: "row-reverse" as const }]
                  : []),
                ...(headerPhoto.type === "image" && headerPhoto.placement === "above"
                  ? [{ flexDirection: "column" as const }]
                  : [])
              ]}
            >
              <Block block={headerPhoto} />
              <View style={styles.profileHeaderText}>
                <ZoneBlocks blocks={headerTextBlocks} />
              </View>
            </View>
          ) : (
            <ZoneBlocks blocks={headerBlocks} />
          )}
        </View>

        {bodyRows.map((row, index) => {
          if (row.kind === "full") {
            return (
              <Fragment key={`row-${index}`}>
                <ZoneBlocks blocks={row.blocks} />
              </Fragment>
            );
          }
          const sidebar = (
            <View key="sidebar" style={styles.sidebarColumn}>
              <ZoneBlocks blocks={row.sidebarBlocks} />
            </View>
          );
          const main = (
            <View key="main" style={styles.mainColumn}>
              <ZoneBlocks blocks={row.mainBlocks} />
            </View>
          );
          return (
            <View key={`row-${index}`} style={styles.contentRow}>
              {row.sidebarFirst ? sidebar : main}
              {row.sidebarFirst ? main : sidebar}
            </View>
          );
        })}

        {footerBlocks.length > 0 ? (
          <View style={styles.footer}>
            <ZoneBlocks blocks={footerBlocks} />
          </View>
        ) : null}
      </Page>
    </Document>
  );
};

export const renderResumePdfBlob = ({ fontBaseUrl, resume }: A4DownloadDocumentProps) =>
  pdf(<A4DownloadDocument fontBaseUrl={fontBaseUrl} resume={resume} />).toBlob();

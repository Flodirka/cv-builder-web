import { Document, Font, Link, Page, pdf, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  getResumeBlocks,
  toSafeHttpUrl,
  type Resume,
  type ResumeBlock,
  type ResumeEntry,
  type ResumeLink
} from "@cv-builder/resume-core";

export type ResumePdfDocumentProps = {
  fontBaseUrl: string;
  resume: Resume;
};

const fontFamily = "PT Serif CV Builder";
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
  registeredFontRoots.add(root);
};

Font.registerHyphenationCallback((word) => [word]);

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
  footer: { marginTop: 9, fontSize: 7.5, textAlign: "center" },
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
  divider: {
    height: 0.75,
    marginTop: 5.25,
    marginBottom: 5.25,
    backgroundColor: "#000000"
  },
  spacerXs: { height: 2.25 },
  spacerSm: { height: 4.5 },
  spacerMd: { height: 7.5 },
  spacerLg: { height: 12 }
});

const spacerStyles = {
  xs: styles.spacerXs,
  sm: styles.spacerSm,
  md: styles.spacerMd,
  lg: styles.spacerLg
};

type PdfStyle = (typeof styles)[keyof typeof styles];

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

const BulletList = ({ items, links = [] }: { items: string[]; links?: ResumeLink[] }) => (
  <View style={styles.bullets}>
    {items.map((item, index) => (
      <View key={`${item}-${index}`} style={styles.bulletRow}>
        <Text style={styles.bullet}>•</Text>
        <LinkedText links={links} style={styles.bulletText} text={item} />
      </View>
    ))}
  </View>
);

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
    case "heading":
      return (
        <LinkedText
          links={block.textLinks}
          style={styles[`heading${block.level}`]}
          text={block.text}
        />
      );
    case "paragraph":
      return <LinkedText links={block.textLinks} style={styles.paragraph} text={block.text} />;
    case "labeled_text":
      return (
        <Text style={styles.labeledText}>
          <LinkedText links={block.textLinks} style={styles.labeledPrefix} text={block.label} />:{" "}
          <LinkedText links={block.textLinks} text={block.text} />
        </Text>
      );
    case "bullet_list":
      return <BulletList items={block.items} links={block.textLinks} />;
    case "divider":
      return <View style={styles.divider} />;
    case "spacer":
      return <View style={spacerStyles[block.size]} />;
    case "entry":
      return <EntryBlock entry={block.entry} />;
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
    {blocks.map((block) => (
      <Block block={block} key={block.id} />
    ))}
  </>
);

export const ResumePdfDocument = ({ fontBaseUrl, resume }: ResumePdfDocumentProps) => {
  registerFonts(fontBaseUrl);
  const headerBlocks = visibleZoneBlocks(resume, "header");
  const mainBlocks = visibleZoneBlocks(resume, "main");
  const footerBlocks = visibleZoneBlocks(resume, "footer");

  return (
    <Document
      author={resume.person.fullName}
      language={resume.language}
      subject="Resume"
      title={`${resume.person.fullName} CV`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <ZoneBlocks blocks={headerBlocks} />
        </View>
        <View>
          <ZoneBlocks blocks={mainBlocks} />
        </View>
        {footerBlocks.length > 0 ? (
          <View style={styles.footer}>
            <ZoneBlocks blocks={footerBlocks} />
          </View>
        ) : null}
      </Page>
    </Document>
  );
};

export const renderResumePdfBlob = ({ fontBaseUrl, resume }: ResumePdfDocumentProps) =>
  pdf(<ResumePdfDocument fontBaseUrl={fontBaseUrl} resume={resume} />).toBlob();

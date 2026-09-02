import Link from "next/link";
import { builtInContentTemplates, createResumeFromContentTemplate } from "@/resume";
import { ResumePrintDocument } from "@/templates";
import { ScaledPrintPreview } from "@/app/editor/ScaledPrintPreview";
import styles from "./classic-compact/page.module.css";

export default function ContentTemplatePreviewPage() {
  return (
    <main className={styles.preview}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/">
          CV Builder
        </Link>
        <Link className={styles.backLink} href="/">
          Back to editor
        </Link>
      </header>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Content template review</p>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Two structures, one A4 renderer</h1>
            <span className={styles.badge}>A4 · ATS-safe</span>
          </div>
          <p className={styles.subtitle}>
            Both content templates become editor blocks and use the same A4 print renderer.
          </p>
        </div>
      </section>
      <section className={styles.workspace} aria-label="Content template comparison">
        <div className={styles.grid}>
          {builtInContentTemplates.map((template) => {
            const resume = createResumeFromContentTemplate(template);
            return (
              <section className={styles.fixture} key={template.name}>
                <header className={styles.fixtureHeader}>
                  <div>
                    <p className={styles.fixtureLanguage}>{template.language}</p>
                    <h2 className={styles.fixtureTitle}>{template.name}</h2>
                  </div>
                  <span className={styles.fixtureMeta}>Editor blocks · A4</span>
                </header>
                <div className={styles.pageFrame}>
                  <ScaledPrintPreview>
                    <ResumePrintDocument resume={resume} title={template.name} />
                  </ScaledPrintPreview>
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </main>
  );
}

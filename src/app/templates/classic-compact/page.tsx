import Link from "next/link";
import { ResumePrintDocument } from "@/templates";
import { englishSampleResume, russianSampleResume } from "@/resume";
import styles from "./page.module.css";

const fixtures = [
  { title: "English fixture", language: "EN", resume: englishSampleResume },
  { title: "Russian fixture", language: "RU", resume: russianSampleResume }
];

export default function ClassicCompactPreviewPage() {
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
          <p className={styles.eyebrow}>Template preview</p>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>classic-compact</h1>
            <span className={styles.badge}>A4 · one column</span>
          </div>
          <p className={styles.subtitle}>
            Print-safe English and Russian fixtures for the active resume template. The white pages
            below match the content rendered by Chromium PDF export.
          </p>
        </div>
      </section>

      <section className={styles.workspace} aria-label="Template fixtures">
        <div className={styles.grid}>
          {fixtures.map((fixture) => (
            <section className={styles.fixture} key={fixture.title}>
              <header className={styles.fixtureHeader}>
                <div>
                  <p className={styles.fixtureLanguage}>{fixture.language}</p>
                  <h2 className={styles.fixtureTitle}>{fixture.title}</h2>
                </div>
                <span className={styles.fixtureMeta}>Sample data · A4</span>
              </header>
              <div className={styles.pageFrame}>
                <ResumePrintDocument resume={fixture.resume} title={fixture.title} />
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}

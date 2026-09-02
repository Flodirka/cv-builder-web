import { BlockEditor } from "./editor/BlockEditor";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>CV Builder</h1>
      </header>

      <section className={styles.editorSection} aria-labelledby="editor-heading">
        <h2 id="editor-heading" className={styles.visuallyHidden}>
          Resume editor
        </h2>
        <BlockEditor initialBlocks={[]} initialPersonName="" />
      </section>
    </main>
  );
}

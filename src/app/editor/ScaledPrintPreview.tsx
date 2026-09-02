"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import styles from "./ScaledPrintPreview.module.css";

const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

export function ScaledPrintPreview({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    const page = pageRef.current;
    if (!viewport || !stage || !page) return;

    const update = () => {
      const pageWidth = Math.max(page.scrollWidth, A4_WIDTH_PX);
      const pageHeight = Math.max(page.scrollHeight, A4_HEIGHT_PX);
      const scale = Math.min(1, viewport.clientWidth / pageWidth);
      stage.style.width = `${pageWidth * scale}px`;
      stage.style.height = `${pageHeight * scale}px`;
      page.style.transform = `scale(${scale})`;
    };
    const observer = new ResizeObserver(update);
    update();
    observer.observe(viewport);
    observer.observe(page);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.viewport} ref={viewportRef}>
      <div className={styles.stage} ref={stageRef}>
        <div className={styles.page} ref={pageRef}>
          {children}
        </div>
      </div>
    </div>
  );
}

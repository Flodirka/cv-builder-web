"use client";

import { useEffect, useId, useRef, useState } from "react";
import { lucideIconNames, type ResumeIcon } from "@/resume";
import { ResumeIconSvg } from "@/templates";
import categories from "./icon-categories.json";
import styles from "./BlockEditor.module.css";

const categoryNames = ["All", ...Object.keys(categories)];

export function IconPicker({
  value,
  onChange
}: {
  value?: ResumeIcon;
  onChange: (icon?: ResumeIcon) => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [shown, setShown] = useState(48);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);
  const icons =
    category === "All" ? lucideIconNames : categories[category as keyof typeof categories];
  const matches = icons.filter((name) => name.includes(query.trim().toLowerCase()));
  const choose = (icon?: ResumeIcon) => {
    onChange(icon);
    panel.current?.hidePopover();
  };
  return (
    <>
      <button
        type="button"
        className={`${styles.iconTrigger} ${value ? "" : styles.emptyIconTrigger}`}
        aria-label="Heading icon"
        title={value ?? "Choose icon"}
        popoverTarget={id}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const width = Math.min(360, window.innerWidth - 32);
          const height = Math.min(480, window.innerHeight - 32);
          setPosition({
            left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
            top:
              rect.bottom + height + 8 <= window.innerHeight
                ? rect.bottom + 6
                : Math.max(16, rect.top - height - 6)
          });
        }}
      >
        {value ? (
          <ResumeIconSvg icon={value} className={styles.headingIcon} />
        ) : (
          <span aria-hidden="true">+</span>
        )}
      </button>
      <div
        id={id}
        ref={panel}
        popover="auto"
        className={styles.iconPickerPanel}
        style={position}
        onToggle={(event) => {
          const expanded = event.currentTarget.matches(":popover-open");
          setOpen(expanded);
        }}
      >
        {open && (
          <>
            <label>
              Search {lucideIconNames.length} Lucide icons
              <input
                ref={search}
                aria-label="Search icons"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setShown(48);
                }}
                placeholder="briefcase, code, globe…"
              />
            </label>
            <div role="tablist" aria-label="Icon categories" className={styles.iconCategories}>
              {categoryNames.map((name, index) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={category === name}
                  tabIndex={category === name ? 0 : -1}
                  onClick={() => {
                    setCategory(name);
                    setShown(48);
                  }}
                  onKeyDown={(event) => {
                    const next =
                      event.key === "ArrowRight"
                        ? (index + 1) % categoryNames.length
                        : event.key === "ArrowLeft"
                          ? (index + categoryNames.length - 1) % categoryNames.length
                          : event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? categoryNames.length - 1
                              : undefined;
                    if (next === undefined) return;
                    event.preventDefault();
                    setCategory(categoryNames[next]);
                    setShown(48);
                    (
                      event.currentTarget.parentElement?.children[next] as HTMLButtonElement
                    ).focus();
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => choose()}>
              No icon
            </button>
            <div role="tabpanel" aria-label={`${category} icons`}>
              <div className={styles.iconGrid}>
                {matches.slice(0, shown).map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    title={icon}
                    aria-label={icon}
                    aria-pressed={value === icon}
                    onClick={() => choose(icon)}
                  >
                    <ResumeIconSvg icon={icon} className={styles.iconThumbnail} />
                    <span>{icon.slice(7)}</span>
                  </button>
                ))}
              </div>
              <p>{matches.length} matching icons</p>
              {matches.length > shown && (
                <button type="button" onClick={() => setShown(shown + 48)}>
                  Show more icons
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

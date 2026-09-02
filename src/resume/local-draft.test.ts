import { describe, expect, it } from "vitest";
import { englishSampleResume } from "./fixtures";
import { LOCAL_DRAFT_KEY, readLocalDraft, removeLocalDraft, writeLocalDraft } from "./local-draft";

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values
  };
};

describe("local draft storage", () => {
  it("round-trips a validated resume", () => {
    const target = storage();
    writeLocalDraft(target, englishSampleResume);
    expect(readLocalDraft(target)).toEqual(englishSampleResume);
  });

  it("ignores malformed and invalid saved data", () => {
    const target = storage();
    target.values.set(LOCAL_DRAFT_KEY, "not json");
    expect(readLocalDraft(target)).toBeNull();
    target.values.set(LOCAL_DRAFT_KEY, JSON.stringify({ language: "en" }));
    expect(readLocalDraft(target)).toBeNull();
  });

  it("removes the saved draft", () => {
    const target = storage();
    writeLocalDraft(target, englishSampleResume);
    removeLocalDraft(target);
    expect(readLocalDraft(target)).toBeNull();
  });
});

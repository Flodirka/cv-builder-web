import { resumeSchema, type Resume } from "./schema";

export const LOCAL_DRAFT_KEY = "cv-builder.resume.v1";

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const readLocalDraft = (storage: Pick<DraftStorage, "getItem">): Resume | null => {
  const source = storage.getItem(LOCAL_DRAFT_KEY);
  if (!source) return null;

  try {
    const parsed = resumeSchema.safeParse(JSON.parse(source));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const writeLocalDraft = (storage: Pick<DraftStorage, "setItem">, resume: Resume) => {
  storage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(resumeSchema.parse(resume)));
};

export const removeLocalDraft = (storage: Pick<DraftStorage, "removeItem">) => {
  storage.removeItem(LOCAL_DRAFT_KEY);
};

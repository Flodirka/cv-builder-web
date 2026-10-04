export const toSafeHttpUrl = (value: string): string | undefined => {
  if (!value || value !== value.trim()) return undefined;
  if (!/^https?:\/\/[^/\\\s]+/iu.test(value) || /[\\\s\u0000-\u001f\u007f]/u.test(value)) {
    return undefined;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
};

export const isSafeHttpUrl = (value: string): boolean => toSafeHttpUrl(value) !== undefined;

const safeImageDataUrl = /^data:image\/(?:png|jpeg);base64,[a-z0-9+/]+={0,2}$/iu;

export const toSafeImageUrl = (value: string): string | undefined =>
  toSafeHttpUrl(value) ?? (safeImageDataUrl.test(value) ? value : undefined);

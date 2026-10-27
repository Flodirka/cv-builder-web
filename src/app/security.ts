export const STATIC_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "media-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "connect-src 'self' data: https://cv-builder-relay.flodirka.workers.dev",
  "worker-src 'self' blob:",
  "child-src 'self' blob:"
].join("; ");

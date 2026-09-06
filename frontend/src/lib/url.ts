// src/lib/url.ts
// URL-scheme guard for values that reach an href/src sink. React does NOT
// strip dangerous schemes (javascript:, data:, vbscript:) on <a href> or
// <img src>, so any user- or admin-supplied URL is filtered here before it
// is rendered. Only absolute http(s) URLs pass; everything else -> undefined
// (the link/image simply renders inert instead of executing).
export function safeHttpUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

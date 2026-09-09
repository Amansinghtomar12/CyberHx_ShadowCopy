// src/lib/validation.ts
// Client-side rules for the optional profile fields. The database keeps its
// own CHECK constraints as the backstop; these give immediate, friendly
// feedback and normalise input so a player never meets a raw refusal.
// Blank always means "not set" and is stored as NULL.

export type Valid = { ok: true; value: string | null };
export type Invalid = { ok: false; reason: string };
export type Result = Valid | Invalid;

/** A hostname with at least one dot and an alphabetic TLD: no bare IPs, no localhost. */
const HOST_RE = /^([a-z0-9-]+\.)+[a-z]{2,63}$/i;

/** A real website: http(s), a real domain, no credentials, no spaces. A bare
    domain is completed to https:// so players need not know the rule. */
export function validateWebsite(raw: string): Result {
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  if (t.length > 500) return { ok: false, reason: '[ INVALID LINK ] Website is too long (max 500 characters).' };
  if (/\s/.test(t)) return { ok: false, reason: '[ INVALID LINK ] A web address cannot contain spaces.' };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  let u: URL;
  try { u = new URL(withScheme); } catch { return { ok: false, reason: '[ INVALID LINK ] That is not a valid web address.' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: '[ INVALID LINK ] Only http:// or https:// links are allowed.' };
  if (u.username || u.password) return { ok: false, reason: '[ INVALID LINK ] A link cannot contain credentials.' };
  if (!HOST_RE.test(u.hostname)) return { ok: false, reason: '[ INVALID LINK ] Use a full domain, e.g. https://yourblog.com' };
  return { ok: true, value: u.href };
}

/** Affiliation: a real organisation name — 2–100 chars, contains a letter,
    no links or markup, no runs of filler punctuation. */
export function validateAffiliation(raw: string): Result {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (!t) return { ok: true, value: null };
  if (t.length < 2 || t.length > 100) return { ok: false, reason: '[ INVALID AFFILIATION ] Use 2–100 characters.' };
  if (/[<>{}]/.test(t) || /:\/\//.test(t) || /^www\./i.test(t)) return { ok: false, reason: '[ INVALID AFFILIATION ] Enter a name, not a link or code.' };
  if (!/\p{L}/u.test(t)) return { ok: false, reason: '[ INVALID AFFILIATION ] Include at least one letter.' };
  if (/([^\p{L}\p{N}\s])\1{2,}/u.test(t)) return { ok: false, reason: '[ INVALID AFFILIATION ] That looks like filler — enter your real organisation.' };
  return { ok: true, value: t };
}

/** Country: must come from the picker's list. The dropdown guarantees this in
    the UI; this is the backstop for an edited request. */
export function validateCountry(raw: string, list: readonly string[]): Result {
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  if (!list.includes(t)) return { ok: false, reason: '[ INVALID COUNTRY ] Pick a country from the list.' };
  return { ok: true, value: t };
}

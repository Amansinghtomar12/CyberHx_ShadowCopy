/**
 * Team invite links.
 *
 * A link is ctf.cyberhx.com/?invite=<code>. The code is lifted out of the URL
 * the moment the app boots -- before React renders, so both the sign-in card
 * and the board see it -- and parked in localStorage. It has to survive three
 * things that all throw the URL away: registering, clicking the confirmation
 * e-mail, and coming back from Google. Storage does; the query string does
 * not. The URL is then cleaned so a refresh does not re-trigger anything and
 * the code never ends up in a screenshot of the address bar.
 *
 * The OAuth return carries its tokens in the hash. Only a hash that literally
 * starts with #invite= is touched here; everything else is left for Supabase.
 */
const KEY = 'cyberhx.invite';
const PARAM = 'invite';
const SHAPE = /^[0-9A-Za-z_-]{6,64}$/;

/** Read an invite off the URL (if any), park it, strip it. Returns what is pending. */
export function captureInvite(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    let code = url.searchParams.get(PARAM);
    const fromHash = url.hash.startsWith('#invite=') ? decodeURIComponent(url.hash.slice(8)) : null;
    if (!code && fromHash) code = fromHash;

    if (code !== null) {
      code = code.trim();
      if (SHAPE.test(code)) localStorage.setItem(KEY, code);
      url.searchParams.delete(PARAM);
      if (fromHash !== null) url.hash = '';
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    return pendingInvite();
  } catch {
    return null;
  }
}

export function pendingInvite(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && SHAPE.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function clearInvite(): void {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

/** The shareable form of a code. */
export function inviteLink(code: string): string {
  return `${window.location.origin}/?${PARAM}=${encodeURIComponent(code)}`;
}

/** What auth flows should come back to, so a pending invite is not lost on
    a device that never had it in storage (e-mail opened on the phone). */
export function returnUrl(): string {
  const code = pendingInvite();
  return code ? inviteLink(code) : window.location.origin;
}

/** What the server says about a code, for the confirm panels. */
export interface InvitePreview {
  name?: string;
  members?: number;
  size?: number;
  full?: boolean;
  locked?: boolean;
  error?: string;
}

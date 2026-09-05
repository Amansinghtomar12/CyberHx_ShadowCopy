/**
 * Uplink — does the backend answer?
 *
 * Every request the client makes passes through uplinkFetch. A response,
 * any response the platform itself produced, including a 401 or a 429, means
 * the backend is up. A network failure or a gateway error (5xx, which is
 * also what the edge returns when the project behind it is unreachable)
 * counts against it. Two of those inside forty seconds and the platform
 * declares the uplink down, the app shows the hold screen, and a probe
 * knocks on the auth health endpoint every eight seconds until something
 * answers. The first success clears the hold.
 *
 * The point is that an outage never looks like an error page. It looks like
 * the platform deliberately holding, because that is what it is doing.
 */
export interface UplinkState {
  down: boolean;
  /** When the hold began, ms since epoch. */
  since: number | null;
  /** Probes sent since the hold began. */
  attempts: number;
}

const WINDOW_MS = 40_000;
const THRESHOLD = 2;
const PROBE_MS = 8_000;

let url = '';
let apikey = '';
let failures = 0;
let lastFailure = 0;
let state: UplinkState = { down: false, since: null, attempts: 0 };
let probe: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(s: UplinkState) => void>();

function emit() { listeners.forEach(fn => fn(state)); }

export function configureUplink(projectUrl: string, anonKey: string) {
  url = projectUrl.replace(/\/$/, '');
  apikey = anonKey;
}

export function uplinkState(): UplinkState { return state; }

export function subscribeUplink(fn: (s: UplinkState) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

async function probeOnce() {
  if (state.down) { state = { ...state, attempts: state.attempts + 1 }; emit(); }
  try {
    const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey }, cache: 'no-store' });
    if (r.status < 500) recordSuccess(); else recordFailure();
  } catch {
    recordFailure();
  }
}

function startProbe() {
  if (probe) return;
  probe = setInterval(() => { void probeOnce(); }, PROBE_MS);
}
function stopProbe() {
  if (probe) { clearInterval(probe); probe = null; }
}

export function recordFailure() {
  const now = Date.now();
  if (now - lastFailure > WINDOW_MS) failures = 0;
  failures += 1;
  lastFailure = now;
  if (!state.down && failures >= THRESHOLD) {
    state = { down: true, since: now, attempts: 0 };
    emit();
  }
  // The first failure starts the probe, so a page that makes only one
  // request, the sign-in page, still learns within a probe interval whether
  // that failure was the backend or a blip. A probe that answers clears the
  // count; one that fails is the second strike.
  startProbe();
}

export function recordSuccess() {
  failures = 0;
  if (state.down) {
    state = { down: false, since: null, attempts: 0 };
    emit();
    stopProbe();
  }
}

/** Drop-in for fetch that keeps the uplink store informed. */
export const uplinkFetch: typeof fetch = async (input, init) => {
  try {
    const r = await fetch(input, init);
    // 501 is "not implemented", an application answer; everything else at
    // 5xx is the platform or the gateway failing to answer for it.
    if (r.status >= 500 && r.status !== 501) recordFailure();
    else recordSuccess();
    return r;
  } catch (e) {
    // A request the app itself cancelled says nothing about the network.
    if (!(e instanceof DOMException && e.name === 'AbortError')) recordFailure();
    throw e;
  }
};

/**
 * Uplink — does the backend answer?
 *
 * Every request the client makes passes through uplinkFetch. A response,
 * any response the platform itself produced, including a 401, a 429 or even
 * a 500 from one query, means the backend is up. What counts against it is
 * a network failure or a gateway answer (502/503/504: the edge could not
 * reach the project). Two of those inside forty seconds and the platform
 * declares the uplink down, the app shows the hold screen, and a probe
 * knocks on the auth health endpoint until something answers.
 *
 * The probe backs off (8 s, 16 s, 32 s, 60 s) with random jitter, and the
 * recovery is spread over a few seconds, so several thousand clients that
 * lost the backend at the same instant do not all come back in the same
 * frame and knock it over again.
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
const PROBE_BASE_MS = 8_000;
const PROBE_MAX_MS = 60_000;
const RECOVERY_SPREAD_MS = 10_000;
const GATEWAY_DOWN = new Set([502, 503, 504]);

let url = '';
let apikey = '';
let failures = 0;
let lastFailure = 0;
let state: UplinkState = { down: false, since: null, attempts: 0 };
let probe: ReturnType<typeof setTimeout> | null = null;
let recovering = false;
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

function jittered(ms: number) { return ms * (0.5 + Math.random()); }

async function probeOnce() {
  if (state.down) { state = { ...state, attempts: state.attempts + 1 }; emit(); }
  let up = false;
  try {
    const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey }, cache: 'no-store' });
    up = r.status < 500;
  } catch {
    up = false;
  }
  if (up) {
    if (state.down) {
      // Spread the return so a synchronised outage does not end in a
      // synchronised reconnect of every client at once.
      recovering = true;
      setTimeout(() => { recovering = false; recordSuccess(); }, Math.random() * RECOVERY_SPREAD_MS);
    } else {
      recordSuccess();
    }
    return;
  }
  recordFailure();
}

function scheduleProbe() {
  if (probe || recovering) return;
  const delay = Math.min(PROBE_BASE_MS * 2 ** Math.min(state.attempts, 3), PROBE_MAX_MS);
  probe = setTimeout(() => { probe = null; void probeOnce(); }, jittered(delay));
}
function stopProbe() {
  if (probe) { clearTimeout(probe); probe = null; }
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
  scheduleProbe();
}

export function recordSuccess() {
  failures = 0;
  if (state.down) {
    state = { down: false, since: null, attempts: 0 };
    emit();
  }
  stopProbe();
}

/** Drop-in for fetch that keeps the uplink store informed. */
export const uplinkFetch: typeof fetch = async (input, init) => {
  try {
    const r = await fetch(input, init);
    // Only the gateway saying the project is unreachable counts. A 500 from
    // one query is that query's problem, not evidence the backend is gone,
    // and treating it as such is how a busy minute becomes a reconnect storm.
    if (GATEWAY_DOWN.has(r.status)) recordFailure();
    else if (r.status < 500) recordSuccess();
    return r;
  } catch (e) {
    // A request the app itself cancelled says nothing about the network.
    if (!(e instanceof DOMException && e.name === 'AbortError')) recordFailure();
    throw e;
  }
};

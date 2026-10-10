import React, { Suspense, useMemo, useState } from 'react';
import { Flame, ChevronRight, Layers, Loader2, Download, Lock } from 'lucide-react';
import { safeHttpUrl } from '../../lib/url';
import type { ChainSeriesVM } from './chainModel';

// The chain experience (canvas renderer + steel/fire image assets) is a
// separate chunk, loaded only when a player actually enters a series. The
// chain is the same under every skin: the steel links are what a chained
// series looks like here, and the event theme does not replace them.
const ChainExperience = React.lazy(() => import('./ChainExperience'));

/**
 * One section of the board: a named act with the chains filed under it.
 *
 * Built by the caller, not here, so this component stays the platform's
 * and does not have to know what a Ramayana chapter is. Without it the
 * board is the flat grid of chains it has always been.
 */
export interface ChainGroup {
  /** Stable key; also what the caller uses to find its own record. */
  key: string;
  /** "Ayodhya". */
  title: string;
  /** "The Beginning". */
  subtitle?: string;
  /** The act's number, shown as a mark before the title. */
  ordinal?: number;
  state: 'completed' | 'current' | 'locked';
  /** Challenges solved in this act, and how many there are. */
  solved?: number;
  total?: number;
  /** Why it is shut. Shown in place of the chains while it is locked. */
  lockedReason?: string;
  /** Ids of the chains in this act, in the order they should be shown. */
  seriesIds: readonly string[];
}

interface Props {
  vms: ChainSeriesVM[];
  category: string | 'all';
  onOpenChallenge: (challengeId: string) => void;
  /** Story-mode locks, passed straight through to the chain renderer. */
  chainLocked?: ReadonlySet<string>;
  /**
   * Group the chains into acts. Omit it and the board is one flat grid,
   * which is what every event that is not running a story gets.
   */
  groups?: readonly ChainGroup[];
}

const DIFF_COLOR: Record<string, string> = {
  Easy: 'var(--color-diff-easy, #7dd3fc)',
  Medium: 'var(--color-diff-medium, #fcd34d)',
  Hard: 'var(--color-diff-hard, #fb923c)',
  Insane: 'var(--color-diff-insane, #c084fc)',
};

function MiniChain({ vm }: { vm: ChainSeriesVM }) {
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {vm.nodes.map((n, i) => (
        <React.Fragment key={n.challengeId}>
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              n.solved ? 'bg-cyber-neon shadow-[0_0_8px_color-mix(in_srgb,var(--color-neon)_60%,transparent)]' : 'bg-surface-sunken ring-1 ring-border-subtle'
            }`}
          />
          {i < vm.segments.length && (
            <span
              className={`inline-block h-0.5 w-4 rounded ${
                vm.segments[i].active
                  ? 'bg-gradient-to-r from-orange-400 to-red-500 shadow-[0_0_8px_rgba(255,120,24,0.7)]'
                  : 'bg-border-subtle'
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function ChainedBoard({ vms, category, onOpenChallenge, chainLocked, groups }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const shown = useMemo(
    () => vms.filter((v) => category === 'all' || v.category === category),
    [vms, category],
  );

  const selected = selectedId ? vms.find((v) => v.id === selectedId) ?? null : null;

  if (selected) {
    return (
      <Suspense
        fallback={
          <div className="flex h-[60vh] items-center justify-center text-text-muted">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Initializing chain…
          </div>
        }
      >
        <ChainExperience
          chainLocked={chainLocked}
          key={selected.id}
          series={selected}
          onOpenChallenge={onOpenChallenge}
          onBack={() => setSelectedId(null)}
        />
      </Suspense>
    );
  }
  if (shown.length === 0) {
    return (
      <div className="surface flex flex-col items-center text-center px-6 py-16" role="status">
        <span
          aria-hidden="true"
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-surface-inset text-text-muted"
        >
          <Layers className="h-5 w-5" />
        </span>
        <h3 className="mb-2 text-h3 text-cyber-text">No chains here yet</h3>
        <p className="max-w-sm text-body text-text-muted">
          {category === 'all'
            ? 'Chained operations will appear here once organisers publish them.'
            : `No chained operations in ${category} yet.`}
        </p>
      </div>
    );
  }

  const grid = (list: ChainSeriesVM[]) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {list.map((vm) => (
        <SeriesCard key={vm.id} vm={vm} onEnter={() => setSelectedId(vm.id)} />
      ))}
    </div>
  );

  // No grouping asked for: the flat board, exactly as it has always been.
  if (!groups || groups.length === 0) return grid(shown);

  const byId = new Map(shown.map((v) => [v.id, v] as const));
  // Chains the caller did not file under any act. They are still playable,
  // so they go last under their own heading rather than quietly vanishing.
  const grouped = new Set(groups.flatMap((g) => [...g.seriesIds]));
  const loose = shown.filter((v) => !grouped.has(v.id));

  const visible = groups
    .map((g) => ({ group: g, list: g.seriesIds.map((id) => byId.get(id)).filter(Boolean) as ChainSeriesVM[] }))
    // An act with nothing in it is not a section, it is a gap. Hide it —
    // except while it is locked, because a locked act the player can see
    // ahead of them is the whole point of running a story.
    .filter(({ group, list }) => list.length > 0 || group.state === 'locked');

  if (visible.length === 0) return grid(shown);

  return (
    <div className="space-y-8">
      {visible.map(({ group, list }) => (
        <section key={group.key} aria-labelledby={`chain-act-${group.key}`} data-state={group.state}>
          <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {group.ordinal !== undefined && (
              <span
                aria-hidden="true"
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-micro font-semibold ${
                  group.state === 'locked'
                    ? 'border-border-subtle text-text-muted'
                    : 'border-border-neon text-cyber-neon'
                }`}
              >
                {group.state === 'locked' ? <Lock className="h-3.5 w-3.5" /> : group.ordinal}
              </span>
            )}
            <h3 id={`chain-act-${group.key}`} className="text-h3 font-bold text-cyber-text">
              {group.title}
            </h3>
            {group.subtitle && <span className="text-small text-text-muted">{group.subtitle}</span>}
            {group.total ? (
              <span className="ml-auto font-mono text-micro text-text-muted">
                {group.solved ?? 0} / {group.total}
              </span>
            ) : null}
          </header>

          {group.state === 'locked' ? (
            <p className="rounded-lg border border-dashed border-border-subtle px-4 py-5 text-small text-text-muted">
              {group.lockedReason ?? 'Locked. Finish the chapter before this one.'}
            </p>
          ) : (
            grid(list)
          )}
        </section>
      ))}

      {loose.length > 0 && (
        <section aria-labelledby="chain-act-other">
          <h3 id="chain-act-other" className="mb-3 text-h3 font-bold text-cyber-text">
            Other operations
          </h3>
          {grid(loose)}
        </section>
      )}
    </div>
  );
}

/** One chain, as a card on the board. */
function SeriesCard({ vm, onEnter }: { vm: ChainSeriesVM; onEnter: () => void }) {
  const pct = vm.total ? Math.round((vm.solvedCount / vm.total) * 100) : 0;
  const dl = safeHttpUrl(vm.readmeUrl ?? '');
  return (
    <div className="card-interactive group flex flex-col items-start gap-3 rounded-lg border border-border-subtle bg-surface-raised p-5">
      <button onClick={onEnter} className="flex w-full flex-col items-start gap-3 text-left">
        <div className="flex w-full items-start justify-between gap-2">
          <div>
            <div className="label-micro text-text-muted">{vm.category} / chained</div>
            <h3 className="text-h3 font-bold text-cyber-text">{vm.title}</h3>
          </div>
          {vm.difficulty && (
            <span className="shrink-0 text-micro font-semibold" style={{ color: DIFF_COLOR[vm.difficulty] }}>
              {vm.difficulty}
            </span>
          )}
        </div>

        {vm.description && (
          <p className="line-clamp-2 text-small text-text-secondary">{vm.description}</p>
        )}

        <MiniChain vm={vm} />

        <div className="mt-1 w-full">
          <div className="flex items-center justify-between text-micro text-text-muted">
            <span className="inline-flex items-center gap-1">
              {vm.activeSegmentCount > 0 && <Flame className="h-3.5 w-3.5 text-cyber-neon" />}
              {vm.total} operations
            </span>
            <span className="font-mono">{vm.solvedCount} / {vm.total}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--color-neon-dim), var(--color-neon), var(--color-neon-bright))' }}
            />
          </div>
        </div>
      </button>

      <div className="flex w-full items-center justify-between gap-2">
        <button onClick={onEnter} className="inline-flex items-center gap-1 text-small font-semibold text-cyber-neon">
          Enter chain <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
        {dl && (
          <a
            href={dl}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="inline-flex items-center gap-1 text-micro text-text-muted hover:text-cyber-neon"
          >
            <Download className="h-3.5 w-3.5" /> Briefing
          </a>
        )}
      </div>
    </div>
  );
}

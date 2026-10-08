import React, { Suspense, useMemo, useState } from 'react';
import {
  Flame, ChevronRight, Layers, Loader2, Download, Check, Lock, X,
  User, Crown, Server,
} from 'lucide-react';
import { safeHttpUrl } from '../../lib/url';
import type { ChainSeriesVM } from '../chain/chainModel';
import type { B2RBoxVM } from './b2rModel';

// The chain renderer (canvas + steel/fire assets) is a separate chunk, loaded
// only when a player actually enters a B2R chain. It is the SAME renderer the
// Chained mode uses — a B2R chain's nodes are boxes instead of challenges.
const ChainExperience = React.lazy(() => import('../chain/ChainExperience'));

interface Props {
  boxes: B2RBoxVM[];
  seriesVMs: ChainSeriesVM[];
  subMode: 'free' | 'chained';
  category: string | 'all';
  /** Opens the normal challenge modal for the underlying flag challenge —
   *  the solve/submit path is completely unchanged. */
  onOpenChallenge: (challengeId: string) => void;
}

const DIFF_COLOR: Record<string, string> = {
  Easy: 'var(--color-diff-easy, #7dd3fc)',
  Medium: 'var(--color-diff-medium, #fcd34d)',
  Hard: 'var(--color-diff-hard, #fb923c)',
  Insane: 'var(--color-diff-insane, #c084fc)',
};

// ── One flag row: USER or ROOT ─────────────────────────────────────────
function FlagRow({
  kind, points, solved, byTeammate, available, onSubmit,
}: {
  kind: 'user' | 'root';
  points: number | null;
  solved: boolean;
  byTeammate: boolean;
  available: boolean;
  onSubmit: () => void;
}) {
  const isRoot = kind === 'root';
  const Icon = isRoot ? Crown : User;
  return (
    <div
      className={[
        'flex items-center gap-3 rounded-md border px-3 py-2',
        solved
          ? 'border-border-neon bg-cyber-neon/10'
          : 'border-border-subtle bg-surface-sunken',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${
          solved ? 'border-border-neon text-cyber-neon' : 'border-border-strong text-text-muted'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="label-micro font-mono text-text-muted">{isRoot ? 'ROOT FLAG' : 'USER FLAG'}</div>
        <div className="flex items-center gap-2 text-small">
          {points != null && <span className="font-mono text-text-secondary">{points}p</span>}
          {solved ? (
            <span className="inline-flex items-center gap-1 font-semibold text-cyber-neon">
              <Check className="h-3.5 w-3.5" /> Captured{byTeammate ? ' by teammate' : ''}
            </span>
          ) : !available ? (
            <span className="inline-flex items-center gap-1 text-text-muted"><Lock className="h-3.5 w-3.5" /> Unavailable</span>
          ) : (
            <span className="text-text-muted">{isRoot ? 'Escalate to root' : 'Get a foothold'}</span>
          )}
        </div>
      </div>
      {!solved && available && (
        <button
          onClick={onSubmit}
          className={`btn btn-sm shrink-0 ${isRoot ? 'btn-primary' : 'btn-secondary'}`}
        >
          Submit {isRoot ? 'root' : 'user'}
        </button>
      )}
    </div>
  );
}

// ── The two-flag body shared by the card and the chain-node overlay ────
function BoxFlags({ box, onOpenChallenge }: { box: B2RBoxVM; onOpenChallenge: (id: string) => void }) {
  return (
    <div className="flex w-full flex-col gap-2">
      <FlagRow
        kind="user"
        points={box.userChallenge?.points ?? null}
        solved={box.userSolved}
        byTeammate={box.userSolvedByTeammate}
        available={!!box.userChallenge}
        onSubmit={() => onOpenChallenge(box.userChallengeId)}
      />
      <FlagRow
        kind="root"
        points={box.rootChallenge?.points ?? null}
        solved={box.rootSolved}
        byTeammate={box.rootSolvedByTeammate}
        available={!!box.rootChallenge}
        onSubmit={() => onOpenChallenge(box.rootChallengeId)}
      />
    </div>
  );
}

function BoxCard({ box, onOpenChallenge }: { box: B2RBoxVM; onOpenChallenge: (id: string) => void }) {
  const dl = safeHttpUrl(box.readmeUrl ?? '');
  const pct = box.points ? Math.round((box.earned / box.points) * 100) : 0;
  return (
    <div
      className={[
        'card-interactive group flex flex-col items-start gap-3 rounded-lg border p-5',
        box.rooted ? 'border-border-neon bg-cyber-neon/5' : 'border-border-subtle bg-surface-raised',
      ].join(' ')}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="label-micro text-text-muted">{box.category} / b2r</div>
          <h3 className="flex items-center gap-2 text-h3 font-bold text-cyber-text">
            <Server className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            <span className="truncate">{box.title}</span>
          </h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {box.difficulty && (
            <span className="text-micro font-semibold" style={{ color: DIFF_COLOR[box.difficulty] }}>
              {box.difficulty}
            </span>
          )}
          {box.rooted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-cyber-neon/15 px-2 py-0.5 text-micro font-semibold text-cyber-neon">
              <Flame className="h-3 w-3" /> ROOTED
            </span>
          )}
        </div>
      </div>

      {box.description && (
        <p className="line-clamp-2 text-small text-text-secondary">{box.description}</p>
      )}

      <BoxFlags box={box} onOpenChallenge={onOpenChallenge} />

      <div className="mt-1 w-full">
        <div className="flex items-center justify-between text-micro text-text-muted">
          <span>{box.rooted ? 'Machine fully compromised' : box.userSolved ? 'User owned — root next' : 'Not yet breached'}</span>
          <span className="font-mono">{box.earned} / {box.points}p</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--color-neon-dim), var(--color-neon), var(--color-neon-bright))' }}
          />
        </div>
      </div>

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
  );
}

function EmptyBoard({ category, chained }: { category: string | 'all'; chained: boolean }) {
  return (
    <div className="surface flex flex-col items-center text-center px-6 py-16" role="status">
      <span
        aria-hidden="true"
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-surface-inset text-text-muted"
      >
        {chained ? <Layers className="h-5 w-5" /> : <Server className="h-5 w-5" />}
      </span>
      <h3 className="mb-2 text-h3 text-cyber-text">{chained ? 'No B2R chains here yet' : 'No B2R boxes here yet'}</h3>
      <p className="max-w-sm text-body text-text-muted">
        {category === 'all'
          ? `Boot-to-root ${chained ? 'chains' : 'machines'} will appear here once organisers publish them.`
          : `No boot-to-root ${chained ? 'chains' : 'machines'} in ${category} yet.`}
      </p>
    </div>
  );
}

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

export default function B2RBoard({ boxes, seriesVMs, subMode, category, onOpenChallenge }: Props) {
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [openBoxId, setOpenBoxId] = useState<string | null>(null);

  const boxById = useMemo(() => {
    const m = new Map<string, B2RBoxVM>();
    boxes.forEach((b) => m.set(b.id, b));
    return m;
  }, [boxes]);

  // FREE = boxes not in any published series; CHAINED = the series list.
  const freeBoxes = useMemo(
    () => boxes.filter((b) => b.seriesId == null && (category === 'all' || b.category === category)),
    [boxes, category],
  );
  const shownSeries = useMemo(
    () => seriesVMs.filter((v) => category === 'all' || v.category === category),
    [seriesVMs, category],
  );

  const openBox = openBoxId ? boxById.get(openBoxId) ?? null : null;

  // A chain node IS a box: clicking it opens the box's two-flag panel, and
  // each flag button then opens the ordinary challenge modal.
  const boxOverlay = openBox && (
    <div
      className="fixed inset-0 z-[4500] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${openBox.title} flags`}
      onClick={() => setOpenBoxId(null)}
    >
      <div
        className="surface-raised relative w-full max-w-lg rounded-lg border border-border-subtle p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={() => setOpenBoxId(null)} className="btn btn-ghost btn-sm absolute right-3 top-3" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <div className="label-micro text-text-muted">{openBox.category} / b2r</div>
        <h2 className="mb-1 flex items-center gap-2 text-h3 font-bold text-cyber-text">
          <Server className="h-4 w-4 text-text-muted" aria-hidden="true" /> {openBox.title}
        </h2>
        {openBox.description && <p className="mb-4 text-small text-text-secondary">{openBox.description}</p>}
        <BoxFlags
          box={openBox}
          onOpenChallenge={(id) => { setOpenBoxId(null); onOpenChallenge(id); }}
        />
      </div>
    </div>
  );

  // ── CHAINED sub-mode ──────────────────────────────────────────────────
  if (subMode === 'chained') {
    const selected = selectedSeriesId ? seriesVMs.find((v) => v.id === selectedSeriesId) ?? null : null;

    if (selected) {
      return (
        <>
          <Suspense
            fallback={
              <div className="flex h-[60vh] items-center justify-center text-text-muted">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Initializing chain…
              </div>
            }
          >
            <ChainExperience
              key={selected.id}
              series={selected}
              onOpenChallenge={(boxId) => setOpenBoxId(boxId)}
              onBack={() => setSelectedSeriesId(null)}
            />
          </Suspense>
          {boxOverlay}
        </>
      );
    }

    if (shownSeries.length === 0) return <EmptyBoard category={category} chained />;

    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shownSeries.map((vm) => {
          const pct = vm.total ? Math.round((vm.solvedCount / vm.total) * 100) : 0;
          const dl = safeHttpUrl(vm.readmeUrl ?? '');
          return (
            <div
              key={vm.id}
              className="card-interactive group flex flex-col items-start gap-3 rounded-lg border border-border-subtle bg-surface-raised p-5"
            >
              <button onClick={() => setSelectedSeriesId(vm.id)} className="flex w-full flex-col items-start gap-3 text-left">
                <div className="flex w-full items-start justify-between gap-2">
                  <div>
                    <div className="label-micro text-text-muted">{vm.category} / b2r chain</div>
                    <h3 className="text-h3 font-bold text-cyber-text">{vm.title}</h3>
                  </div>
                  {vm.difficulty && (
                    <span className="shrink-0 text-micro font-semibold" style={{ color: DIFF_COLOR[vm.difficulty] }}>
                      {vm.difficulty}
                    </span>
                  )}
                </div>
                {vm.description && <p className="line-clamp-2 text-small text-text-secondary">{vm.description}</p>}
                <MiniChain vm={vm} />
                <div className="mt-1 w-full">
                  <div className="flex items-center justify-between text-micro text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      {vm.activeSegmentCount > 0 && <Flame className="h-3.5 w-3.5 text-cyber-neon" />}
                      {vm.total} machines
                    </span>
                    <span className="font-mono">{vm.solvedCount} / {vm.total} rooted</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--color-neon-dim), var(--color-neon), var(--color-neon-bright))' }} />
                  </div>
                </div>
              </button>
              <div className="flex w-full items-center justify-between gap-2">
                <button onClick={() => setSelectedSeriesId(vm.id)} className="inline-flex items-center gap-1 text-small font-semibold text-cyber-neon">
                  Enter chain <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
                {dl && (
                  <a href={dl} target="_blank" rel="noopener noreferrer" download className="inline-flex items-center gap-1 text-micro text-text-muted hover:text-cyber-neon">
                    <Download className="h-3.5 w-3.5" /> Briefing
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── FREE sub-mode ─────────────────────────────────────────────────────
  if (freeBoxes.length === 0) return <EmptyBoard category={category} chained={false} />;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {freeBoxes.map((box) => (
          <BoxCard key={box.id} box={box} onOpenChallenge={onOpenChallenge} />
        ))}
      </div>
      {boxOverlay}
    </>
  );
}

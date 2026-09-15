import React, { Suspense, useMemo, useState } from 'react';
import { Flame, ChevronRight, Layers, Loader2, Download } from 'lucide-react';
import { safeHttpUrl } from '../../lib/url';
import type { ChainSeriesVM } from './chainModel';

// The chain experience (canvas renderer + steel/fire image assets) is a
// separate chunk, loaded only when a player actually enters a series.
const ChainExperience = React.lazy(() => import('./ChainExperience'));

interface Props {
  vms: ChainSeriesVM[];
  category: string | 'all';
  onOpenChallenge: (challengeId: string) => void;
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
              n.solved ? 'bg-cyber-neon shadow-[0_0_8px_rgba(198,255,0,0.6)]' : 'bg-surface-sunken ring-1 ring-border-subtle'
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

export default function ChainedBoard({ vms, category, onOpenChallenge }: Props) {
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

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {shown.map((vm) => {
        const pct = vm.total ? Math.round((vm.solvedCount / vm.total) * 100) : 0;
        const dl = safeHttpUrl(vm.readmeUrl ?? '');
        return (
          <div
            key={vm.id}
            className="card-interactive group flex flex-col items-start gap-3 rounded-lg border border-border-subtle bg-surface-raised p-5"
          >
            <button onClick={() => setSelectedId(vm.id)} className="flex w-full flex-col items-start gap-3 text-left">
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
                    style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#8fb800,#c6ff00,#ddff6b)' }}
                  />
                </div>
              </div>
            </button>

            <div className="flex w-full items-center justify-between gap-2">
              <button
                onClick={() => setSelectedId(vm.id)}
                className="inline-flex items-center gap-1 text-small font-semibold text-cyber-neon"
              >
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
      })}
    </div>
  );
}

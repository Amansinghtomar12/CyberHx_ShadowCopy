/**
 * LostSector — a path that leads nowhere.
 *
 * The platform has one route. Anything else typed into the bar used to get
 * the host's plain-text 404, which is the one page on the site that did not
 * belong to the site. This is what it says instead: same environment, same
 * voice, one way back. The decoy flag is for the players who will inevitably
 * try it; it is not a flag for anything.
 */
import { Compass, ArrowLeft } from 'lucide-react';
import AmbientBackground from './AmbientBackground';

export default function LostSector({ path, onReturn }: { path: string; onReturn: () => void }) {
  const shown = path.length > 48 ? path.slice(0, 45) + '…' : path;
  return (
    <div className="min-h-screen bg-cyber-bg text-cyber-text font-sans">
      <AmbientBackground intensity="normal" />
      <div className="page-shell min-h-screen flex items-center justify-center px-4 py-16">
        <section className="surface-overlay hold-panel relative w-full max-w-xl overflow-hidden p-6 sm:p-10">
          <span aria-hidden="true" className="hold-scan" />
          <p className="label-micro text-cyber-neon">// sector not found</p>
          <h1 className="readout mt-2 text-display text-cyber-text">Off the map</h1>
          <p className="mt-3 text-body text-text-secondary">
            Coordinates <span className="font-mono text-cyber-text break-all">{shown}</span> do not
            resolve to anything in this universe. The board, the scoreboard and your team all
            live at the origin.
          </p>
          <ol className="hold-log mt-6 space-y-1.5 font-mono text-small" aria-hidden="true">
            <li className="hold-line"><span className="text-cyber-neon">&gt;</span> resolving route … no such sector</li>
            <li className="hold-line"><span className="text-cyber-neon">&gt;</span> scanning for flags … flag&#123;n0t_th4t_e4sy&#125;</li>
            <li className="hold-line"><span className="text-cyber-neon">&gt;</span> plotting course home<span className="hold-caret" /></li>
          </ol>
          <div className="mt-7 flex flex-wrap gap-3">
            <button type="button" onClick={onReturn} className="btn btn-primary btn-md">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Return to base
            </button>
            <a href="/support.html" className="btn btn-ghost btn-md">
              <Compass className="h-4 w-4" aria-hidden="true" /> Support
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

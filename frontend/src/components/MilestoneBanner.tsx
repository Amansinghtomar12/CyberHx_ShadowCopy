/**
 * MilestoneBanner — the platform saying your name back to you.
 *
 * One at a time, top centre, 2.6 seconds, never blocking. It sits above the
 * modal because the moment it announces happens inside the modal, and it is
 * pointer-transparent so it cannot eat the click that dismisses the solve.
 *
 * It arrives *after* the completion showcase rather than on top of it. Two
 * celebrations competing for the same second is not twice the celebration.
 */
import { useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Award } from 'lucide-react';
import type { Milestone } from '../lib/milestones';

const TONE: Record<Milestone['tone'], { line: string; text: string; wash: string }> = {
  neon:   { line: 'var(--color-cyber-neon)',   text: 'var(--color-cyber-neon)',   wash: 'var(--color-neon-wash)' },
  gold:   { line: 'var(--color-diff-medium)',  text: 'var(--color-diff-medium)',  wash: 'var(--color-diff-medium-wash)' },
  violet: { line: 'var(--color-diff-insane)',  text: 'var(--color-diff-insane)',  wash: 'var(--color-diff-insane-wash)' },
};

interface MilestoneBannerProps {
  milestone: Milestone;
  onDone: () => void;
}

export default function MilestoneBanner({ milestone, onDone }: MilestoneBannerProps) {
  const reduce = useReducedMotion() ?? false;
  const tone = TONE[milestone.tone] ?? TONE.neon;

  useEffect(() => {
    const t = setTimeout(onDone, reduce ? 2000 : 2600);
    return () => clearTimeout(t);
  }, [onDone, reduce, milestone.id]);

  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <motion.div
      className="milestone-root"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -22, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.98 }}
      transition={{ duration: reduce ? 0.2 : 0.38, ease }}
      role="status"
      aria-live="polite"
    >
      <div className="milestone-plate" style={{ borderColor: tone.line, backgroundColor: tone.wash }}>
        <span aria-hidden="true" className="milestone-glyph" style={{ color: tone.text, borderColor: tone.line }}>
          <Award className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="milestone-title" style={{ color: tone.text }}>{milestone.title}</span>
          <span className="milestone-detail">{milestone.detail}</span>
        </span>
        {/* A single sweep across the plate. Decoration only — it runs behind
            the text and never displaces it. */}
        {!reduce && (
          <motion.span
            aria-hidden="true"
            className="milestone-sweep"
            style={{ background: `linear-gradient(90deg, transparent, ${tone.text}, transparent)` }}
            initial={{ x: '-120%', opacity: 0 }}
            animate={{ x: '120%', opacity: [0, 0.5, 0] }}
            transition={{ duration: 1.1, ease: 'linear', delay: 0.18 }}
          />
        )}
      </div>
    </motion.div>
  );
}

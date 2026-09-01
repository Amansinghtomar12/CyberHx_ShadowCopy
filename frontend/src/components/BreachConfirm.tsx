/**
 * BreachConfirm — what the system does when you actually get in.
 *
 * Solving an operation is the emotional peak of a twelve-hour CTF and it used
 * to be a line of text, then three flat rings. This is the version that gives
 * the moment an object: a small spatial artifact assembles out of nothing,
 * turns once so you can see it has depth, and resolves. The points are counted
 * out on its face.
 *
 * WHY CSS 3D AND NOT A SECOND WEBGL PASS
 *   There is already a WebGL context running the environment behind this modal,
 *   and it is running four draw passes a frame at up to 420 nodes. Standing up
 *   a second context for a 1.9-second flourish costs a program link, a GPU
 *   allocation and a real risk of a context-loss on the phones that can least
 *   afford it. The card grid already proves CSS 3D is enough here: it has run a
 *   perspective tilt with `preserve-3d` since the redesign. Nested rotated
 *   rings inside one perspective are compositor work — transform and opacity
 *   only, no layout, no paint.
 *
 * DESIGN RULES IT STILL FOLLOWS
 *   · No confetti. The system is confirming a breach, not throwing a party.
 *   · It never blocks. Pointer-transparent except for a click that dismisses
 *     it early, so nobody is held hostage by an animation.
 *   · It ends. The real solved panel is underneath the whole time — this is a
 *     layer over the truth, never a substitute for it.
 *   · Transform and opacity only.
 *
 * LEGENDARY
 *   An Insane operation gets more shells, a violet core and a longer turn —
 *   but only 600ms longer. A player who lands five Insane operations must not
 *   learn to dread the reward.
 *
 * REDUCED MOTION
 *   The artifact does not assemble at all. The words and the score still
 *   arrive, because they are information, not decoration.
 */
import { useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useCountUp } from './AnimatedNumber';

interface BreachConfirmProps {
  points: number;
  /** Insane operations resolve into the legendary variant. */
  legendary?: boolean;
  onDone: () => void;
}

/** Each shell holds its own plane; the core turns them all as one body. */
const SHELLS_NORMAL = [
  { size: 156, rx: 0,   ry: 0,   spin:  1, delay: 0,    weight: 1   },
  { size: 112, rx: 64,  ry: 0,   spin: -1, delay: 0.09, weight: 0.8 },
  { size: 72,  rx: 0,   ry: 62,  spin:  1, delay: 0.17, weight: 0.6 },
];

const SHELLS_LEGENDARY = [
  { size: 196, rx: 0,   ry: 0,   spin:  1, delay: 0,    weight: 1   },
  { size: 164, rx: 58,  ry: 0,   spin: -1, delay: 0.07, weight: 0.9 },
  { size: 130, rx: 0,   ry: 58,  spin:  1, delay: 0.14, weight: 0.8 },
  { size: 96,  rx: 42,  ry: 42,  spin: -1, delay: 0.21, weight: 0.65 },
  { size: 60,  rx: 0,   ry: 0,   spin:  1, delay: 0.28, weight: 0.5 },
];

export default function BreachConfirm({ points, legendary = false, onDone }: BreachConfirmProps) {
  const reduce = useReducedMotion() ?? false;
  // Shared with the scoreboard's figures — one count-up, one easing curve.
  // The explicit 0 origin is what makes this one animate on its only paint.
  const shown = useCountUp(points, legendary ? 1150 : 900, 0);

  const shells = legendary ? SHELLS_LEGENDARY : SHELLS_NORMAL;
  const turnMs = legendary ? 2100 : 1500;
  const holdMs = reduce ? 900 : (legendary ? 2500 : 1900);

  // Self-dismissing. The caller does not have to manage a timer, and the
  // solved panel underneath is already correct when this disappears.
  useEffect(() => {
    const t = setTimeout(onDone, holdMs);
    return () => clearTimeout(t);
  }, [onDone, holdMs]);

  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <motion.div
      className={`breach-root${legendary ? ' is-legendary' : ''}`}
      onClick={onDone}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      aria-live="polite"
    >
      {!reduce && (
        <div className="breach-stage" aria-hidden="true">
          {/* The body. Everything inside shares this rotation, which is what
              makes the shells read as one object rather than three rings. */}
          <motion.div
            className="breach-core"
            initial={{ rotateX: -16, rotateY: -28 }}
            animate={{ rotateX: 10, rotateY: legendary ? 312 : 268 }}
            transition={{ duration: turnMs / 1000, ease }}
          >
            {shells.map((s, i) => (
              <motion.span
                key={i}
                className="breach-shell"
                style={{
                  width: s.size,
                  height: s.size,
                  marginLeft: -s.size / 2,
                  marginTop: -s.size / 2,
                  // Negative margins do the centring so the transform stays
                  // purely rotational — motion owns it and would clobber a
                  // translate written here.
                  opacity: s.weight,
                }}
                initial={{ rotateX: s.rx, rotateY: s.ry, scale: 0.12, opacity: 0 }}
                animate={{
                  rotateX: s.rx,
                  rotateY: s.ry + s.spin * (legendary ? 220 : 160),
                  scale: 1,
                  opacity: [0, s.weight, s.weight, 0],
                }}
                transition={{
                  duration: (holdMs - 120) / 1000,
                  delay: s.delay,
                  ease,
                  opacity: { duration: (holdMs - 120) / 1000, delay: s.delay, times: [0, 0.12, 0.72, 1] },
                }}
              />
            ))}

            {/* Six struts through the centre. They are what stops the object
                reading as flat rings when it is edge-on. */}
            {[0, 30, 60, 90, 120, 150].map((deg, i) => (
              <motion.span
                key={`strut-${deg}`}
                className="breach-strut"
                style={{ transform: `rotateZ(${deg}deg)` }}
                initial={{ opacity: 0, scaleX: 0.2 }}
                animate={{ opacity: [0, 0.34, 0.2, 0], scaleX: 1 }}
                transition={{ duration: (holdMs - 200) / 1000, delay: 0.12 + i * 0.03, ease }}
              />
            ))}
          </motion.div>

          {/* One shockwave leaving the artifact. The energy going out into the
              field, which the WebGL background is answering at the same moment. */}
          <motion.span
            className="breach-wave"
            initial={{ scale: 0.25, opacity: 0.5 }}
            animate={{ scale: legendary ? 3.4 : 2.8, opacity: 0 }}
            transition={{ duration: 1.2, ease }}
          />
          {legendary && (
            <motion.span
              className="breach-wave"
              initial={{ scale: 0.25, opacity: 0.4 }}
              animate={{ scale: 4.1, opacity: 0 }}
              transition={{ duration: 1.5, delay: 0.26, ease }}
            />
          )}
        </div>
      )}

      {/* A single bar sweeping the panel top to bottom — the scan itself. */}
      {!reduce && (
        <motion.span
          className="breach-scan"
          initial={{ y: '-60%', opacity: 0 }}
          animate={{ y: '160%', opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.85, ease: 'linear' }}
        />
      )}

      <motion.div
        className="breach-plate"
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.42, delay: reduce ? 0 : 0.24, ease }}
      >
        {legendary && <span className="breach-rank">Legendary</span>}
        <span className="breach-label">{legendary ? 'Insane operation compromised' : 'Operation compromised'}</span>
        <span className="breach-score readout">
          +{shown}
          <span className="breach-unit">pts</span>
        </span>
      </motion.div>
    </motion.div>
  );
}

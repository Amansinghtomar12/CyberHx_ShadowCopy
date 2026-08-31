/**
 * AccessSequence — the moment of entering the system.
 *
 * THE RULE THIS IS BUILT AROUND
 *   Never make a successful sign-in slower to look good. So this does not play
 *   *after* the request; it plays *during* it. The user was already waiting on
 *   the network — this fills that wait with something legible instead of a
 *   spinner, and gets out of the way the instant the answer arrives.
 *
 *   The only time it adds is the final beat: roughly 600ms to acknowledge
 *   access before handing over. Cutting straight from "verifying" to a fully
 *   rendered dashboard the frame the promise resolves reads as a glitch, not
 *   as speed. Worst case total is under a second and a half; typical is the
 *   request time plus 600ms.
 *
 * FAILURE IS NOT DRAMATISED
 *   A wrong password is not a cinematic event. On error this simply vanishes
 *   and the form comes back with its message. Nobody wants a light show
 *   telling them they typed their password wrong.
 *
 * SIGNUP AND LOGIN TELL DIFFERENT STORIES
 *   Registering is being issued an identity; signing in is being recognised as
 *   one you already have. Same visual language, different words, because they
 *   are genuinely different events.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';

interface AccessSequenceProps {
  mode: 'login' | 'register';
  /** Flips true when the server has actually accepted. */
  granted: boolean;
  /** Called once the acknowledgement beat has finished. */
  onDone: () => void;
}

const STEPS: Record<'login' | 'register', string[]> = {
  login: ['Credentials received', 'Verifying signature', 'Restoring session'],
  register: ['Credentials received', 'Provisioning identity', 'Joining the network'],
};

const GRANTED_MS = 600;

export default function AccessSequence({ mode, granted, onDone }: AccessSequenceProps) {
  const reduce = useReducedMotion() ?? false;
  const steps = STEPS[mode];
  const [step, setStep] = useState(0);
  const done = useRef(false);

  // Advance through the steps while we wait. The pace is a guess at how long
  // the request will take; if it finishes early the granted branch below cuts
  // the queue, and if it takes longer the last step simply holds.
  useEffect(() => {
    if (granted) return;
    const id = setInterval(() => setStep(s => Math.min(s + 1, steps.length - 1)), 420);
    return () => clearInterval(id);
  }, [granted, steps.length]);

  // Acknowledge, then hand over. Guarded because a parent re-render must not
  // be able to fire the handover twice.
  useEffect(() => {
    if (!granted || done.current) return;
    done.current = true;
    const id = setTimeout(onDone, reduce ? 120 : GRANTED_MS);
    return () => clearTimeout(id);
  }, [granted, onDone, reduce]);

  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <motion.div
      className="access-root"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      // Locks the form beneath it: the brief asks for the interface to stop
      // accepting input the moment verification starts.
      aria-live="polite"
      aria-busy={!granted}
    >
      {granted ? (
        <motion.div
          className="access-grant"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.34, ease }}
        >
          {!reduce && (
            <motion.span
              className="access-ring"
              initial={{ scale: 0.4, opacity: 0.6 }}
              animate={{ scale: 2.2, opacity: 0 }}
              transition={{ duration: 0.9, ease }}
            />
          )}
          <span className="access-check"><Check className="h-5 w-5" aria-hidden="true" /></span>
          <span className="access-title">
            {mode === 'register' ? 'Identity issued' : 'Access granted'}
          </span>
        </motion.div>
      ) : (
        <div className="access-steps">
          <span className="boot" aria-hidden="true"><span className="boot-core" /></span>
          <ul className="access-list">
            {steps.map((label, i) => (
              <li
                key={label}
                className="access-step"
                data-state={i < step ? 'done' : i === step ? 'active' : 'pending'}
              >
                <span className="access-dot" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

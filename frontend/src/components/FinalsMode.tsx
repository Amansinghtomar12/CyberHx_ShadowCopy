/**
 * FinalsMode — Grand Finale atmosphere for CyberHX CTF.
 *
 * Active only during the finals window (Sept 25, 10:00–22:00 IST).
 * Adds: golden particle rain, cinematic GRAND FINALE banner with countdown,
 * and a gold-tinted CSS override layer. Everything here is presentation-only;
 * no queries, no auth, no data writes.
 *
 * To revert after the finals: delete this file, remove its import and usage
 * from App.tsx, and remove the .finals-active CSS block from index.css.
 */
import { useEffect, useRef, useState, useMemo } from 'react';
import { Trophy, Flame, Timer, Star } from 'lucide-react';

const FINALS_START = new Date('2026-09-25T04:30:00Z'); // 10:00 IST
const FINALS_END   = new Date('2026-09-25T16:30:00Z'); // 22:00 IST

export function useFinalsMode(): boolean {
  const [active, setActive] = useState(() => {
    const now = Date.now();
    return now >= FINALS_START.getTime() && now < FINALS_END.getTime();
  });

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      setActive(now >= FINALS_START.getTime() && now < FINALS_END.getTime());
    };
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  return active;
}

function useFinalsCountdown() {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const target = FINALS_END.getTime();
    const tick = () => {
      const rem = target - Date.now();
      setLeft(rem > 0 ? rem : null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (left == null) return null;
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return { h, m, s };
}

// Gold particle rain canvas
function GoldParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reduceMotion.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number; hue: number }[] = [];
    const COUNT = 60;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: 0.2 + Math.random() * 0.6,
        size: 1 + Math.random() * 2.5,
        opacity: 0.2 + Math.random() * 0.5,
        hue: 35 + Math.random() * 25,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y > canvas.height) { p.y = -4; p.x = Math.random() * canvas.width; }
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 85%, 60%, ${p.opacity})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 85%, 60%, ${p.opacity * 0.15})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  if (reduceMotion.current) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1]"
      style={{ opacity: 0.7 }}
    />
  );
}

export function FinalesBanner() {
  const countdown = useFinalsCountdown();
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="finals-banner relative overflow-hidden rounded-card border border-[rgba(255,185,50,0.3)] mb-6">
      {/* Animated gradient background */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, rgba(255,170,0,0.12) 0%, rgba(255,100,0,0.08) 30%, rgba(180,50,0,0.06) 60%, rgba(255,200,50,0.1) 100%)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 finals-shimmer"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,200,50,0.08) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
        }}
      />

      {/* Top gold line */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, #ffb932, #ff8c00, #ffb932, transparent)' }}
      />

      <div className="relative px-4 sm:px-6 py-5 sm:py-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
        {/* Left: Trophy icon with glow */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="finals-trophy relative flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-xl border border-[rgba(255,185,50,0.4)] bg-[rgba(255,170,0,0.1)]">
            <Trophy className="h-7 w-7 sm:h-8 sm:w-8 text-[#ffb932]" />
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-xl finals-trophy-pulse"
              style={{ boxShadow: '0 0 20px rgba(255,185,50,0.3), inset 0 0 20px rgba(255,185,50,0.1)' }}
            />
          </div>
        </div>

        {/* Center: Title */}
        <div className="flex-1 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
            <Flame className="h-4 w-4 text-[#ff8c00] finals-flicker" />
            <span className="text-label uppercase text-[#ffb932] tracking-[0.2em]">The Final Battle</span>
            <Flame className="h-4 w-4 text-[#ff8c00] finals-flicker" style={{ animationDelay: '0.5s' }} />
          </div>
          <h2
            className="text-h1 sm:text-display font-extrabold tracking-tighter"
            style={{
              background: 'linear-gradient(135deg, #ffcc00, #ffb932, #ff8c00, #ffcc00)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundSize: '200% 200%',
              animation: 'finals-gradient 4s ease infinite',
            }}
          >
            GRAND FINALE
          </h2>
          <p className="text-small text-[#c9a055] mt-1 flex items-center gap-1.5 justify-center sm:justify-start">
            <Star className="h-3 w-3" />
            Only the best remain. Make every flag count.
            <Star className="h-3 w-3" />
          </p>
        </div>

        {/* Right: Countdown */}
        {countdown && (
          <div className="shrink-0 text-center">
            <div className="flex items-center gap-1 mb-1.5 justify-center">
              <Timer className="h-3.5 w-3.5 text-[#ff8c00]" />
              <span className="text-label uppercase text-[#c9a055] tracking-widest">Time Left</span>
            </div>
            <div className="flex items-baseline gap-1 font-mono">
              <span className="text-h1 sm:text-display text-[#ffcc00] tabular-nums">{pad(countdown.h)}</span>
              <span className="text-h3 text-[#ff8c00] finals-blink">:</span>
              <span className="text-h1 sm:text-display text-[#ffcc00] tabular-nums">{pad(countdown.m)}</span>
              <span className="text-h3 text-[#ff8c00] finals-blink">:</span>
              <span className="text-h1 sm:text-display text-[#ffcc00] tabular-nums">{pad(countdown.s)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom gold line */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, #ffb932, #ff8c00, #ffb932, transparent)' }}
      />
    </div>
  );
}

export function FinalsNavBadge() {
  return (
    <span className="finals-nav-badge inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-micro uppercase tracking-widest border border-[rgba(255,185,50,0.4)] bg-[rgba(255,170,0,0.12)] text-[#ffb932]">
      <Trophy className="h-2.5 w-2.5" />
      FINALE
    </span>
  );
}

export { GoldParticles };

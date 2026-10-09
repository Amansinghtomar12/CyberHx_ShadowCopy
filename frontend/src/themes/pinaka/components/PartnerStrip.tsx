/**
 * PartnerStrip — who runs the event, and who stands with it.
 *
 * The one rule: CyberHX scores Pinaka CTF; it does not organise or own it.
 * Every block here keeps that order of credit — the event and its organiser,
 * the institutions, the association, the partners, and only then the
 * platform, in the role config.ts gives it. All copy and names come from
 * PINAKA_EVENT, PINAKA_PARTNERS and the asset barrels; nothing is typed here
 * that would need re-checking against the public site twice.
 *
 * A sponsor wall. Every logo is the file as supplied on pinakactf.com, in
 * full colour, with no filter and no reduced opacity, sitting on the tile its
 * artwork was drawn for (SPONSOR_TILES: its own background, or a light or
 * dark plate) inside a thin gold mount, with the partner's name beneath it.
 * The institutional marks (dark ink) sit on an ivory plate in a gold frame.
 * Images carry alt="" because the visible name that follows already names
 * them; a screen reader hears each name once.
 *
 *   'footer'   the full wall at the foot of every signed-in page
 *   'gateway'  a compact plate at the foot of the sign-in hero
 *
 * Both end with the photographs' credit line, built from PLATE_CREDITS: the
 * CC BY-SA plates require their attribution to be visible wherever they are
 * shown, and the footer (or, on the sign-in page, the hero) is where it
 * lives. Every title links to its source and every licence to its deed.
 *
 * Motion: a tile lifts (transform) and its glow fades in (opacity) on hover
 * or focus. Nothing moves under prefers-reduced-motion or on the 'still'
 * capability tier (data-still on the root).
 */
import type { CSSProperties } from 'react';
import { useReducedMotion } from 'motion/react';
import { getCapability } from '../../../components/environment/performance';
import { PINAKA_EVENT, PINAKA_PARTNERS, type Partner } from '../config';
import { PLATE_CREDITS } from '../assets/plates';
import { INSTITUTIONAL_MARKS, type InstitutionalMark } from '../assets/institutional';
import { DEFAULT_TILE, FEATURED_SPONSORS, SPONSOR_TILES, type SponsorTile } from '../assets/sponsors';
import { PINAKA_IMAGES } from '../assets/images';

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

type Variant = 'footer' | 'gateway';

/* ── A logo on its tile ────────────────────────────────────────────────── */

/** The gold mount, the plate (the tile's own colour), and the file as supplied. */
function LogoTile({ src, tile }: { src?: string; tile: SponsorTile }) {
  const plate = { '--pk-tile-bg': tile.background } as CSSProperties;
  return (
    <span className="pk-sponsor-mount" data-tone={tile.tone} aria-hidden="true">
      <span className="pk-sponsor-plate" data-fit={tile.fit} style={plate}>
        {src
          ? <img className="pk-sponsor-logo" src={src} alt="" aria-hidden="true" draggable={false} loading="lazy" decoding="async" />
          : <span className="pk-sponsor-blank" />}
      </span>
    </span>
  );
}

/** One partner: its tile, its name beneath; a link when the partner has a url. */
function Sponsor({ partner, src, tile, featured = false }: { partner: Partner; src?: string; tile: SponsorTile; featured?: boolean }) {
  const className = `pk-sponsor${featured ? ' is-featured' : ''}`;
  const body = (
    <>
      <LogoTile src={src} tile={tile} />
      <span className="pk-sponsor-name">{partner.name}</span>
    </>
  );
  return partner.url
    ? <a className={`${className} is-link`} href={partner.url} {...EXTERNAL}>{body}</a>
    : <div className={className}>{body}</div>;
}

/** The partners, as a grid of equal tiles. */
function SponsorGrid({ partners }: { partners: readonly Partner[] }) {
  return (
    <ul className="pk-sponsor-grid" aria-label="Partners">
      {partners.map(p => (
        <li key={p.name}>
          <Sponsor partner={p} src={p.logo} tile={SPONSOR_TILES[p.name] ?? DEFAULT_TILE} />
        </li>
      ))}
    </ul>
  );
}

/** A partner with a published role ("In association with"), named apart and larger. */
function Featured({ partner }: { partner: Partner }) {
  const featured = FEATURED_SPONSORS[partner.name];
  return (
    <div className="pk-partners-featured">
      <p className="pk-partners-role">{partner.role}</p>
      <Sponsor
        partner={partner}
        src={featured?.src ?? partner.logo}
        tile={featured?.tile ?? SPONSOR_TILES[partner.name] ?? DEFAULT_TILE}
        featured
      />
    </div>
  );
}

/* ── The institutions, on ivory ─────────────────────────────────────────── */

function InstitutionalMarkFigure({ mark }: { mark: InstitutionalMark }) {
  return (
    <li>
      <figure className="pk-inst-mark">
        <img
          className="pk-inst-logo"
          src={mark.src}
          width={mark.width}
          height={mark.height}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="lazy"
          decoding="async"
        />
        <figcaption className="pk-inst-name">{mark.name}</figcaption>
      </figure>
    </li>
  );
}

/**
 * NFSU and its Chennai campus under "Organised by" (config.organiser is NFSU
 * Chennai); the Ministry of Home Affairs beside them with its name only — no
 * role is stated for it, because none is published.
 */
function InstitutionalPlate() {
  return (
    <div className="pk-inst">
      <div className="pk-inst-group">
        <p className="pk-inst-heading">Organised by</p>
        <ul className="pk-inst-marks">
          <InstitutionalMarkFigure mark={INSTITUTIONAL_MARKS.nfsu} />
          <InstitutionalMarkFigure mark={INSTITUTIONAL_MARKS.nfsuChennai} />
        </ul>
      </div>
      <span className="pk-inst-divider" aria-hidden="true" />
      <div className="pk-inst-group is-headless">
        <ul className="pk-inst-marks">
          <InstitutionalMarkFigure mark={INSTITUTIONAL_MARKS.mha} />
        </ul>
      </div>
    </div>
  );
}

/* ── The photographs' credit line ──────────────────────────────────────── */

/**
 * The photographs' attribution, as CC BY-SA asks: the author (linked to the
 * source), the licence (linked), and the fact that the picture was changed
 * (colour-graded). Titles live in docs/pinaka/ASSETS.md; here the line has
 * to stay short enough to read as a credit, not a paragraph. One inline run
 * that wraps where it must; nothing is truncated.
 */
export function PlateCredits({ className = '' }: { className?: string }) {
  return (
    <p className={`pk-partners-credits ${className}`.trim()}>
      <span className="pk-partners-credits-label">Photographs, colour-graded</span>
      {PLATE_CREDITS.map(c => (
        <span key={c.sourceUrl} className="pk-partners-credit">
          <span className="pk-partners-credits-sep" aria-hidden="true">·</span>
          <a className="pk-partners-credit-link" href={c.sourceUrl} title={c.title} {...EXTERNAL}>{c.author}</a>
          {' ('}
          <a className="pk-partners-credit-link" href={c.licenseUrl} {...EXTERNAL}>{c.license}</a>
          {')'}
        </span>
      ))}
    </p>
  );
}

/* ── The wall ──────────────────────────────────────────────────────────── */

export default function PartnerStrip({ variant = 'footer' }: { variant?: Variant }) {
  const reduce = useReducedMotion() ?? false;
  const still = reduce || getCapability().tier === 'still';

  // The partner whose role is set ("In association with") is named apart;
  // the rest are the field, in published order.
  const association = PINAKA_PARTNERS.filter(p => p.role);
  const field = PINAKA_PARTNERS.filter(p => !p.role);

  const platform = (
    <p className="pk-partners-platform">
      <span className="pk-partners-platform-role">{PINAKA_EVENT.platformRole}</span>
      <span className="pk-partners-credits-sep" aria-hidden="true">·</span>
      {PINAKA_EVENT.platformLine}
    </p>
  );

  if (variant === 'gateway') {
    return (
      <section className="pk-partners pk-partners-gateway" aria-label="Organiser and partners" data-still={still ? 'true' : undefined}>
        <InstitutionalPlate />
        {association.map(p => <Featured key={p.name} partner={p} />)}
        <div className="pk-partners-field">
          <p className="pk-partners-heading" aria-hidden="true">Partners</p>
          <SponsorGrid partners={field} />
        </div>
        {platform}
        <PlateCredits />
      </section>
    );
  }

  return (
    <section className="pk-partners pk-partners-footer" aria-label="Organiser and partners" data-still={still ? 'true' : undefined}>
      <div className="pk-partners-crest" aria-hidden="true">
        <span className="pk-partners-crest-line" />
        <img
          className="pk-footer-shield"
          src={PINAKA_IMAGES.footerShield}
          alt=""
          aria-hidden="true"
          width={53}
          height={44}
          draggable={false}
          loading="lazy"
          decoding="async"
        />
        <span className="pk-partners-crest-line" />
      </div>
      <p className="pk-partners-line">
        <span className="pk-partners-event">{PINAKA_EVENT.name}</span>
        <span className="pk-diamond" aria-hidden="true" />
        <span>Organised by {PINAKA_EVENT.organiser}</span>
      </p>
      <div className="pk-partners-honours">
        <InstitutionalPlate />
        {association.map(p => <Featured key={p.name} partner={p} />)}
      </div>
      <div className="pk-partners-field">
        <p className="pk-partners-heading" aria-hidden="true">Partners</p>
        <SponsorGrid partners={field} />
      </div>
      {platform}
      <PlateCredits />
    </section>
  );
}

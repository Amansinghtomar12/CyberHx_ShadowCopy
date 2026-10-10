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
 * The institutional marks (dark ink) sit on ivory plates in a gold frame:
 * the organiser's plate, headed "Organised by", holds NFSU and its Chennai
 * campus and nothing else; the Ministry of Home Affairs has a plate of its
 * own after it, captioned with its name only (no role is published for it,
 * so none is stated or implied by sharing a heading).
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
 * capability tier (data-still on the section), and the tier is re-read when
 * the player changes the effects setting, so turning effects off stops the
 * lift at once.
 *
 * Loading: lazy, at low fetch priority. The footer wall sits below the fold
 * on every page, and the gateway wall at the foot of a column a phone never
 * shows; the marks are ≈0.3 MB that a visitor who never scrolls there should
 * not pay for. Each plate keeps its colour and size while its file arrives,
 * so nothing shifts and an unloaded tile is a coloured plate with its name,
 * not a hole. The price: a print or a full-page capture taken before the
 * visitor has scrolled near the wall shows the plates and names without the
 * marks. (AuthGateway also renders nothing below lg, so a phone's sign-in
 * fetches none of these files at all.)
 */
import { useEffect, useId, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'motion/react';
import { getCapability } from '../../../components/environment/performance';
import { subscribeFx } from '../../../components/environment/fx';
import { PINAKA_EVENT, PINAKA_PARTNERS, type Partner } from '../config';
import { PLATE_CREDITS } from '../assets/plates';
import { INSTITUTIONAL_MARKS, type InstitutionalMark } from '../assets/institutional';
import { DEFAULT_TILE, FEATURED_SPONSORS, SPONSOR_TILES, type SponsorTile } from '../assets/sponsors';
import { PINAKA_IMAGES } from '../assets/images';

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

type Variant = 'footer' | 'gateway';

/** Every mark on the wall: fetched as it nears the viewport, after the page's own work. */
const DEFERRED = { loading: 'lazy', fetchPriority: 'low', decoding: 'async' } as const;

/**
 * Reduced motion from either source: the OS preference or the player's
 * effects setting. The setting can change on any page (the motion toggle),
 * so the tier is re-read whenever it does, as AuthGateway's useStill does.
 */
function useStill(): boolean {
  const reduce = useReducedMotion() ?? false;
  const [dialStill, setDialStill] = useState(() => getCapability().tier === 'still');
  useEffect(() => subscribeFx(() => setDialStill(getCapability().tier === 'still')), []);
  return reduce || dialStill;
}

/* ── A logo on its tile ────────────────────────────────────────────────── */

/** The gold mount, the plate (the tile's own colour), and the file as supplied. */
function LogoTile({ src, tile }: { src?: string; tile: SponsorTile }) {
  const plate = {
    '--pk-tile-bg': tile.background,
    ...(tile.inset ? { '--pk-tile-inset': `${tile.inset}%` } : null),
  } as CSSProperties;
  return (
    <span className="pk-sponsor-mount" data-tone={tile.tone} aria-hidden="true">
      <span className="pk-sponsor-plate" data-fit={tile.fit} style={plate}>
        {src
          ? (
            <img
              className="pk-sponsor-logo"
              src={src}
              alt=""
              aria-hidden="true"
              draggable={false}
              {...DEFERRED}
            />
          )
          : <span className="pk-sponsor-blank" />}
      </span>
    </span>
  );
}

/**
 * One partner: its tile, and its name beneath (or, featured, beside it under
 * the published role); a link when the partner has a url.
 */
function Sponsor({ partner, src, tile, role }: { partner: Partner; src?: string; tile: SponsorTile; role?: string }) {
  const className = `pk-sponsor${role ? ' is-featured' : ''}`;
  // "MetaCTF · Skillbit" breaks after the dot, never before it.
  const name = <span className="pk-sponsor-name">{partner.name.replace(/ · /g, '\u00a0· ')}</span>;
  const body = (
    <>
      <LogoTile src={src} tile={tile} />
      {role
        ? <span className="pk-sponsor-text"><span className="pk-partners-role">{role}</span>{name}</span>
        : name}
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

/**
 * Every partner on one running line.
 *
 * The track holds the list twice and slides exactly half its own width, so
 * the second copy is under the cursor at the moment the first finishes and
 * the loop has no seam. The duplicate is `aria-hidden` and inert: a screen
 * reader hears each partner once, and a keyboard never lands on a logo it
 * has already passed.
 *
 * It stops when a pointer is over it or focus is inside, because a name a
 * player is trying to read should not walk away from them. On a still
 * device, or under prefers-reduced-motion, it does not move at all and
 * becomes an ordinary horizontal scroller they push themselves.
 */
function SponsorMarquee({ partners }: { partners: readonly Partner[] }) {
  const tile = (p: Partner, dup: boolean) => (
    <li key={(dup ? 'dup-' : '') + p.name} className="pk-sponsor-run-item">
      <Sponsor
        partner={p}
        src={FEATURED_SPONSORS[p.name]?.src ?? p.logo}
        tile={FEATURED_SPONSORS[p.name]?.tile ?? SPONSOR_TILES[p.name] ?? DEFAULT_TILE}
      />
    </li>
  );

  return (
    <div className="pk-sponsor-run">
      <ul className="pk-sponsor-run-track" aria-label="Partners">
        {partners.map(p => tile(p, false))}
      </ul>
      {/* The second lap. Hidden from assistive tech and from the tab order;
          it exists only so the first lap never runs out of track. */}
      <ul className="pk-sponsor-run-track" aria-hidden="true" inert>
        {partners.map(p => tile(p, true))}
      </ul>
    </div>
  );
}

/** A partner with a published role ("In association with"), named apart and larger. */
function Featured({ partner }: { partner: Partner }) {
  const featured = FEATURED_SPONSORS[partner.name];
  return (
    <div className="pk-partners-featured">
      <Sponsor
        partner={partner}
        src={featured?.src ?? partner.logo}
        tile={featured?.tile ?? SPONSOR_TILES[partner.name] ?? DEFAULT_TILE}
        role={partner.role}
      />
    </div>
  );
}

/* ── The institutions, on ivory ─────────────────────────────────────────── */

/** One mark, captioned with the name printed in its artwork. */
function InstitutionalMarkFigure({ mark }: { mark: InstitutionalMark }) {
  return (
    <figure className="pk-inst-mark">
      <img
        className="pk-inst-logo"
        src={mark.src}
        width={mark.width}
        height={mark.height}
        alt=""
        aria-hidden="true"
        draggable={false}
        {...DEFERRED}
      />
      <figcaption className="pk-inst-name">{mark.name}</figcaption>
    </figure>
  );
}

/**
 * The organiser: NFSU and its Chennai campus under "Organised by"
 * (config.organiser is NFSU Chennai). The heading labels this plate, and
 * nothing else stands on it.
 */
function OrganiserPlate() {
  const headingId = useId();
  return (
    <div className="pk-inst" role="group" aria-labelledby={headingId}>
      <p className="pk-inst-heading" id={headingId}>Organised by</p>
      <ul className="pk-inst-marks">
        <li><InstitutionalMarkFigure mark={INSTITUTIONAL_MARKS.nfsu} /></li>
        <li><InstitutionalMarkFigure mark={INSTITUTIONAL_MARKS.nfsuChennai} /></li>
      </ul>
    </div>
  );
}

/**
 * The Ministry of Home Affairs, on a small ivory plate of its own after the
 * organiser's: its mark and its name, and nothing more. No role is published
 * for it, so it carries no heading and shares none.
 */
function MinistryPlate() {
  return (
    <div className="pk-inst is-solo">
      <InstitutionalMarkFigure mark={INSTITUTIONAL_MARKS.mha} />
    </div>
  );
}

/** The organiser, then the ministry, then the partner named in association. */
function Honours({ association }: { association: readonly Partner[] }) {
  return (
    <div className="pk-partners-honours">
      <OrganiserPlate />
      <MinistryPlate />
      {association.map(p => <Featured key={p.name} partner={p} />)}
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

/**
 * The section's name: what it holds, in the order it holds it. The ministry
 * is named among the institutions, not as an organiser or a partner.
 */
const SECTION_LABEL = 'Organiser, institutions and partners';

export default function PartnerStrip({ variant = 'footer' }: { variant?: Variant }) {
  const still = useStill();

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
      <section className="pk-partners pk-partners-gateway" aria-label={SECTION_LABEL} data-still={still ? 'true' : undefined}>
        {/* The institutions hold the top: the university that runs the event
            and the ministry it answers to. Everything else — the associated
            partner included — runs on one line below. */}
        <div className="pk-partners-honours">
          <OrganiserPlate />
          <MinistryPlate />
        </div>
        <div className="pk-partners-field">
          <p className="pk-partners-heading" aria-hidden="true">Partners</p>
          <SponsorMarquee partners={[...association, ...field]} />
        </div>
        {platform}
        <PlateCredits />
      </section>
    );
  }

  return (
    <section className="pk-partners pk-partners-footer" aria-label={SECTION_LABEL} data-still={still ? 'true' : undefined}>
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
          {...DEFERRED}
        />
        <span className="pk-partners-crest-line" />
      </div>
      <p className="pk-partners-line">
        <span className="pk-partners-event">{PINAKA_EVENT.name}</span>
        <span className="pk-diamond" aria-hidden="true" />
        <span>Organised by {PINAKA_EVENT.organiser}</span>
      </p>
      <Honours association={association} />
      <div className="pk-partners-field">
        <p className="pk-partners-heading" aria-hidden="true">Partners</p>
        <SponsorGrid partners={field} />
      </div>
      {platform}
      <PlateCredits />
    </section>
  );
}

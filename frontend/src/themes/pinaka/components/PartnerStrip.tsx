/**
 * PartnerStrip — who runs the event, and who stands with it.
 *
 * The one rule: CyberHX scores Pinaka CTF; it does not organise or own it.
 * Every line here keeps that order of credit — the event, its organiser, the
 * association, the partners — and the platform names itself only in the role
 * config.ts gives it. All copy and names come from PINAKA_EVENT and
 * PINAKA_PARTNERS; nothing is typed here that would need re-checking against
 * the public site twice.
 *
 * Logos are the official files from pinakactf.com, shown exactly as supplied:
 * full colour, each on a tile of the ground it was drawn for (SPONSOR_TILES),
 * with the partner's name under it. The institutional marks (NFSU, NFSU
 * Chennai, MHA) carry dark lettering, so they sit on a light plate.
 *
 *   'footer'   the sponsor wall at the bottom of every page
 *   'gateway'  a compact plate for the sign-in hero
 *
 * Both end with the photographs' credit line, built from PLATE_CREDITS: the
 * CC BY-SA plates require their attribution to be visible wherever they are
 * shown, and the footer (or, on the sign-in page, the hero) is where it
 * lives. Every title links to its source and every licence to its deed.
 */
import { PINAKA_EVENT, PINAKA_PARTNERS, type Partner } from '../config';
import { PLATE_CREDITS } from '../assets/plates';
import { INSTITUTIONAL_LOGOS } from '../assets/institutional';
import { FEATURED_LOGOS, SPONSOR_TILES } from '../assets/sponsors';
import { PINAKA_IMAGES } from '../assets/images';

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

/**
 * A partner as a card: the logo on its tile, the name beneath. The image is
 * alt="" because the name is right there as text; reading both would say the
 * name twice.
 */
function Card({ partner, logo = partner.logo, featured = false }: { partner: Partner; logo?: string; featured?: boolean }) {
  const tile = SPONSOR_TILES[partner.name];
  const inner = (
    <>
      {logo && (
        <span className="pk-partner-tile" data-fit={tile?.fit ?? 'contain'} style={tile ? { backgroundColor: tile.bg } : undefined}>
          <img className="pk-partner-logo" src={logo} alt="" loading="lazy" decoding="async" draggable={false} />
        </span>
      )}
      <span className="pk-partner-name">{partner.name}</span>
    </>
  );
  const cls = `pk-partner-card${featured ? ' is-featured' : ''}`;
  return partner.url
    ? <a className={`${cls} pk-partner-link`} href={partner.url} {...EXTERNAL}>{inner}</a>
    : <span className={cls}>{inner}</span>;
}

/** The partners as a grid of equal cards. */
function Grid({ partners }: { partners: readonly Partner[] }) {
  return (
    <ul className="pk-partners-grid" aria-label="Partners">
      {partners.map(p => <li key={p.name}><Card partner={p} /></li>)}
    </ul>
  );
}

/** NFSU, NFSU Chennai and MHA on a light plate: their lettering is dark. */
function Institutions({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`pk-partners-institutional${compact ? ' is-compact' : ''}`}>
      <img src={INSTITUTIONAL_LOGOS.nfsuEmblem} alt="National Forensic Sciences University" loading="lazy" decoding="async" draggable={false} className="pk-institutional-logo is-wide" />
      <img src={INSTITUTIONAL_LOGOS.nfsuChennai} alt="NFSU Chennai Campus" loading="lazy" decoding="async" draggable={false} className="pk-institutional-logo" />
      <img src={INSTITUTIONAL_LOGOS.mha} alt="Ministry of Home Affairs, Government of India" loading="lazy" decoding="async" draggable={false} className="pk-institutional-logo" />
    </div>
  );
}

/**
 * "Photographs · <title> by <author> (<licence>) · …", one inline run that
 * wraps where it must. Small, muted, mono: the same register as the platform
 * line. Nothing is truncated.
 */
/**
 * The photographs' attribution, as CC BY-SA asks: the author (linked to the
 * source), the licence (linked), and the fact that the picture was changed
 * (colour-graded). Titles live in docs/pinaka/ASSETS.md; here the line has
 * to stay short enough to read as a credit, not a paragraph.
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

function Credits() {
  return <PlateCredits />;
}

export default function PartnerStrip({ variant = 'footer' }: { variant?: 'footer' | 'gateway' }) {
  // The partner whose role is set ("In association with") is named apart;
  // the rest are the field.
  const association = PINAKA_PARTNERS.filter(p => p.role);
  const field = PINAKA_PARTNERS.filter(p => !p.role);

  if (variant === 'gateway') {
    return (
      <div className="pk-partners pk-partners-gateway" aria-label="Event organiser and partners">
        <Institutions compact />
        <span className="pk-eyebrow">{PINAKA_EVENT.platformRole}</span>
        <p className="pk-partners-organiser">
          <span className="pk-partners-event">{PINAKA_EVENT.name}</span>
          {' '}is organised by{' '}
          <a className="pk-partners-organiser-link" href={PINAKA_EVENT.organiserUrl} {...EXTERNAL}>
            {PINAKA_EVENT.organiser}
          </a>
        </p>
        {association.map(p => (
          <div key={p.name} className="pk-partners-association">
            <span className="pk-partners-heading">{p.role}</span>
            <Card partner={p} logo={FEATURED_LOGOS.ine} featured />
          </div>
        ))}
        <Grid partners={field} />
        <p className="pk-partners-platform">{PINAKA_EVENT.platformLine}</p>
        <Credits />
      </div>
    );
  }

  return (
    <div className="pk-partners pk-partners-footer" aria-label="Event organiser and partners">
      <img className="pk-footer-shield" src={PINAKA_IMAGES.footerShield} alt="" aria-hidden="true" height={44} loading="lazy" decoding="async" draggable={false} />
      <p className="pk-partners-line">
        <span>{PINAKA_EVENT.name}</span>
        <span className="pk-diamond" aria-hidden="true" />
        <span>Organised by {PINAKA_EVENT.organiser}</span>
        <span className="pk-diamond" aria-hidden="true" />
        <span>{PINAKA_EVENT.platformLine}</span>
      </p>
      <Institutions />
      {association.map(p => (
        <div key={p.name} className="pk-partners-association">
          <span className="pk-partners-heading">{p.role}</span>
          <Card partner={p} logo={FEATURED_LOGOS.ine} featured />
        </div>
      ))}
      <span className="pk-partners-heading">Partners</span>
      <Grid partners={field} />
      <Credits />
    </div>
  );
}

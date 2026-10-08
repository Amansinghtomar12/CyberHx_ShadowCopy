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
 * Text and hairlines only. No logos are bundled (usage rights were not
 * confirmed for this repo); a partner that later gets a `logo` renders it at
 * 28px with its name as the alt text, and everyone else is a name mark.
 *
 *   'footer'   one compact row for the bottom of the page
 *   'gateway'  a small plate for the sign-in hero
 */
import { PINAKA_EVENT, PINAKA_PARTNERS, type Partner } from '../config';

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** A partner as a mark: the logo when there is one, otherwise the name. */
function Mark({ partner }: { partner: Partner }) {
  const inner = partner.logo
    ? <img className="pk-partner-logo" src={partner.logo} alt={partner.name} height={28} loading="lazy" decoding="async" />
    : <span className="pk-partner-mark">{partner.name}</span>;
  return partner.url
    ? <a className="pk-partner-link" href={partner.url} {...EXTERNAL}>{inner}</a>
    : inner;
}

/** The marks, in a wrapping row, a diamond between neighbours. */
function Marks({ partners, className }: { partners: readonly Partner[]; className?: string }) {
  return (
    <ul className={`pk-partners-marks${className ? ` ${className}` : ''}`} aria-label="Partners">
      {partners.map((p, i) => (
        <li key={p.name}>
          {i > 0 && <span className="pk-diamond" aria-hidden="true" />}
          <Mark partner={p} />
        </li>
      ))}
    </ul>
  );
}

export default function PartnerStrip({ variant = 'footer' }: { variant?: 'footer' | 'gateway' }) {
  // The partner whose role is set ("In association with") is named apart;
  // the rest are the field.
  const association = PINAKA_PARTNERS.filter(p => p.role);
  const field = PINAKA_PARTNERS.filter(p => !p.role);

  if (variant === 'gateway') {
    return (
      <div className="pk-partners pk-partners-gateway" aria-label="Event organiser and partners">
        <span className="pk-eyebrow">{PINAKA_EVENT.platformRole}</span>
        <p className="pk-partners-organiser">
          <span className="pk-partners-event">{PINAKA_EVENT.name}</span>
          {' '}is organised by{' '}
          <a className="pk-partners-organiser-link" href={PINAKA_EVENT.organiserUrl} {...EXTERNAL}>
            {PINAKA_EVENT.organiser}
          </a>
        </p>
        {association.map(p => (
          <p key={p.name} className="pk-partners-association">
            {p.role} <Mark partner={p} />
          </p>
        ))}
        <Marks partners={field} className="is-wrapped" />
        <p className="pk-partners-platform">{PINAKA_EVENT.platformLine}</p>
      </div>
    );
  }

  return (
    <div className="pk-partners pk-partners-footer" aria-label="Event organiser and partners">
      <p className="pk-partners-line">
        <span>{PINAKA_EVENT.name}</span>
        <span className="pk-diamond" aria-hidden="true" />
        <span>Organised by {PINAKA_EVENT.organiser}</span>
        <span className="pk-diamond" aria-hidden="true" />
        <span>{PINAKA_EVENT.platformLine}</span>
      </p>
      <Marks partners={PINAKA_PARTNERS} />
    </div>
  );
}

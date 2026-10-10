/**
 * A chapter's chain, as a row of linked cards.
 *
 * The organisers' design: the chapter's painting fills the page, and its
 * operations sit on it as cards joined by a lit chain — solved behind you,
 * the one you are on glowing in the chapter's own colour, the rest shut.
 * Six cards in the drawings; any number here, because how many operations
 * a chapter is worth is the organisers' call and not this file's.
 *
 * It does not decide anything. `locked` comes from the server's own gate
 * (get_team_chain_progress), `solved` from the trusted solve records the
 * whole board already uses. This file chooses a picture and a colour.
 *
 * The steel-chain renderer is untouched and still what "Enter chain"
 * opens; this is the chapter view that gets a player there.
 */
import React from 'react';
import { Check, Lock, Dot, ChevronRight } from 'lucide-react';
import type { ChainSeriesVM, ChainNodeVM } from '../../../components/chain/chainModel';
import { CHAPTERS, type ChapterId } from '../chapters/config';
import { CHAPTER_PLATES } from '../assets/chapters';
import { SCENE_PLATES } from '../assets/scenes';
import type { SceneId } from '../scenes/config';

export interface ChapterChainProps {
  series: ChainSeriesVM;
  chapter: ChapterId;
  /** Challenge ids this team has not earned yet, as the server counts them. */
  locked: ReadonlySet<string>;
  /** Which battle scene dresses a challenge, when the organisers gave it one. */
  sceneOf?: (challengeId: string) => SceneId | undefined;
  onOpen: (challengeId: string) => void;
  /** Open the steel-chain experience for this chain. */
  onEnter: () => void;
}

type CardState = 'solved' | 'current' | 'locked' | 'open';

/**
 * The card art. A challenge the organisers dressed with a battle scene
 * wears that scene; everything else wears the chapter it belongs to, which
 * is already the page's own background and so costs no extra download.
 */
function artFor(chapter: ChapterId, scene: SceneId | undefined): string {
  return scene ? SCENE_PLATES[scene].w960 : CHAPTER_PLATES[chapter].w960;
}

/**
 * Where in that picture this card looks, as a shift along the slack the
 * stylesheet's zoom creates. Undressed cards all share the chapter's
 * painting, so without this a chapter of six is six identical thumbnails.
 * Walks left to right with the chain, which also means a card keeps its
 * own view when a neighbour is solved.
 */
function panFor(position: number, total: number): string {
  if (total <= 1) return '0%';
  return `${(-14 + ((position - 1) / (total - 1)) * 28).toFixed(1)}%`;
}

/**
 * A description written in Markdown, as one line of plain text.
 *
 * The card is two lines under a title, not a document: rendering the
 * source puts `**Garden Gate**` on the board, and rendering the Markdown
 * would mean shipping a parser to draw sixty characters. Strip the few
 * marks a brief actually uses and stop.
 */
function plain(md: string): string {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')   // links and images → their text
    .replace(/[*_~`>#]+/g, '')                     // emphasis, code, quotes, headings
    .replace(/\s+/g, ' ')
    .trim();
}

function ChainCard({
  node, state, art, pan, onOpen,
}: {
  node: ChainNodeVM;
  state: CardState;
  art: string;
  pan: string;
  onOpen: () => void;
}) {
  const shut = state === 'locked';
  const badge =
    state === 'solved' ? <Check className="h-3.5 w-3.5" aria-hidden="true" />
    : shut ? <Lock className="h-3.5 w-3.5" aria-hidden="true" />
    : <Dot className="h-4 w-4" aria-hidden="true" />;

  return (
    <button
      type="button"
      className="pk-chapcard"
      data-state={state}
      style={{ ['--pk-card-pan' as string]: pan }}
      onClick={onOpen}
      disabled={shut}
      aria-label={shut ? `${node.title} — locked` : node.title}
    >
      <span className="pk-chapcard__art">
        {/* Decorative: the title below says what this is, and a card whose
            picture failed to load is still a readable card. */}
        <img src={art} alt="" loading="lazy" decoding="async" width={480} height={270} />
        <span className="pk-chapcard__badge" data-state={state}>{badge}</span>
        <span className="pk-chapcard__num" aria-hidden="true">{node.position}</span>
      </span>

      <span className="pk-chapcard__body">
        <span className="pk-chapcard__title">{node.title}</span>
        {/* A locked challenge's description is blank before it reaches the
            browser — the view withholds it — so this prints the lock
            rather than an empty line pretending to be a brief. */}
        <span className="pk-chapcard__desc">
          {shut
            ? 'Sealed. Finish the operation before this one.'
            : plain(node.challenge?.description ?? '') || 'Open it for the brief.'}
        </span>
        <span className="pk-chapcard__foot">
          {node.challenge?.category && (
            <span className="pk-chapcard__cat" data-cat={node.challenge.category}>
              {node.challenge.category}
            </span>
          )}
          {node.points !== null && (
            <span className="pk-chapcard__pts">
              <b>{node.points}</b> pts
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export const ChapterChain: React.FC<ChapterChainProps> = ({
  series, chapter, locked, sceneOf, onOpen, onEnter,
}) => {
  const c = CHAPTERS[chapter];

  // The card a player is actually on: the first that is neither solved nor
  // shut. Exactly one, and only when there is one — a finished chain has
  // nothing glowing, which is how it reads as finished.
  const currentIndex = series.nodes.findIndex(
    n => !n.solved && !locked.has(n.challengeId),
  );

  const stateOf = (n: ChainNodeVM, i: number): CardState =>
    n.solved ? 'solved'
    : locked.has(n.challengeId) ? 'locked'
    : i === currentIndex ? 'current'
    : 'open';

  return (
    <section
      className="pk-chapchain"
      style={{
        ['--pk-chap-glow' as string]: c.accents.glow,
        ['--pk-chap-soft' as string]: c.accents.soft,
        ['--pk-chap-deep' as string]: c.accents.deep,
        ['--pk-chap-line' as string]: c.accents.line,
      }}
      aria-labelledby={`pk-chain-${series.id}`}
    >
      <header className="pk-chapchain__head">
        <h4 id={`pk-chain-${series.id}`} className="pk-chapchain__title">{series.title}</h4>
        <span className="pk-chapchain__meta">
          {series.category} · {series.solvedCount} of {series.total}
        </span>
        {/* The steel chain is still here. The cards are the overview — what
            is in this chapter and which of it is open — and this is the
            way into the chain itself, exactly as the card's own button
            was. Replacing the card must not be how a player loses it. */}
        <button type="button" className="pk-chapchain__enter" onClick={onEnter}>
          Enter chain <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </header>

      <ol className="pk-chapchain__row">
        {series.nodes.map((n, i) => (
          <React.Fragment key={n.challengeId}>
            <li className="pk-chapchain__card">
              <ChainCard
                node={n}
                state={stateOf(n, i)}
                art={artFor(chapter, sceneOf?.(n.challengeId))}
                pan={panFor(n.position, series.nodes.length)}
                onOpen={() => onOpen(n.challengeId)}
              />
            </li>
            {i < series.nodes.length - 1 && (
              // Lit only when both ends are solved — the same rule the steel
              // chain has always used for an ignited segment.
              <li
                className="pk-chapchain__link"
                data-lit={series.segments[i]?.active ? '1' : undefined}
                aria-hidden="true"
              >
                <span className="pk-chapchain__node" />
              </li>
            )}
          </React.Fragment>
        ))}
      </ol>
    </section>
  );
};

export default ChapterChain;

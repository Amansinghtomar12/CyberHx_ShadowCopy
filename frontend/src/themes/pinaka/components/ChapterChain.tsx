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
import { SCENE_PLATES } from '../assets/scenes';
import ChainLink from './ChainLink';
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
 * The card art — only where the organisers put some.
 *
 * A challenge dressed with a battle scene wears that scene. Everything
 * else wears nothing: the chapter's painting is already the page behind
 * the whole row, and repeating a crop of it inside each card said the
 * same thing six times and made the row look like a wall of one picture.
 * A card with no scene is a card: name, brief, category, points.
 */
function artFor(scene: SceneId | undefined): string | null {
  return scene ? SCENE_PLATES[scene].w960 : null;
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
  node, state, art, onOpen,
}: {
  node: ChainNodeVM;
  state: CardState;
  art: string | null;
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
      data-art={art ? '1' : undefined}
      onClick={onOpen}
      disabled={shut}
      aria-label={shut ? `${node.title} — locked` : node.title}
    >
      {art && (
        <span className="pk-chapcard__art">
          {/* Decorative: the title below says what this is, and a card
              whose picture failed to load is still a readable card. */}
          <img src={art} alt="" loading="lazy" decoding="async" width={480} height={270} />
        </span>
      )}

      <span className="pk-chapcard__body">
        {/* The position and the state live here rather than over the
            picture, so a card with art and one without are the same
            object with the same furniture in the same places. */}
        <span className="pk-chapcard__head">
          <span className="pk-chapcard__num" aria-hidden="true">{node.position}</span>
          <span className="pk-chapcard__badge" data-state={state}>{badge}</span>
        </span>
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
        {/* No category here. A chain of a web, a crypto and a rev challenge
            has no single one, and each card already carries its own. */}
        <span className="pk-chapchain__meta">
          {series.solvedCount} of {series.total}
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
                art={artFor(sceneOf?.(n.challengeId))}
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
                <ChainLink chapter={chapter} lit={!!series.segments[i]?.active} />
              </li>
            )}
          </React.Fragment>
        ))}
      </ol>
    </section>
  );
};

export default ChapterChain;

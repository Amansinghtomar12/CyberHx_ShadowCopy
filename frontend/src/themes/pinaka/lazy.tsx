/**
 * Pinaka — lazy entry points.
 *
 * The platform's mount points import from here, not from the components, so
 * a default ('cyberhx') build ships none of the theme's JavaScript: each
 * component is its own chunk, fetched only when rendered, and the mount
 * points only render them when isPinaka() is true.
 *
 * Every export is a React.lazy component; wrap in <Suspense fallback={null}>
 * (a decorative layer that arrives a frame late is invisible; a fallback that
 * occupied space would not be).
 */
import React from 'react';

export const PinakaEnvironment = React.lazy(() => import('./components/PinakaEnvironment'));
export const PinakaIntro = React.lazy(() => import('./components/PinakaIntro'));
export const JourneyMap = React.lazy(() => import('./components/JourneyMap'));
export const PartnerStrip = React.lazy(() => import('./components/PartnerStrip'));
export const AuthGateway = React.lazy(() => import('./components/AuthGateway'));
export const PodiumFrame = React.lazy(() => import('./components/PodiumFrame'));
export const ProfileJourney = React.lazy(() => import('./components/ProfileJourney'));
export const ThemeSwitch = React.lazy(() => import('./components/ThemeSwitch'));
/** The six chapters on one rail, above the board. */
export const JourneyBar = React.lazy(() => import('./components/JourneyBar'));
/** The moment a chapter closes and the next opens. */
export const ChapterUnlock = React.lazy(() => import('./components/ChapterUnlock'));

/** The solve acknowledgement, from the motif family. Preloaded at boot. */
export const ArrowSolveLight = React.lazy(() =>
  import('./components/BowMotifs').then(m => ({ default: m.ArrowSolveLight })),
);
/** The photographs' attribution on its own, for screens without the footer (the phone sign-in). */
export const PlateCredits = React.lazy(() => import('./components/PartnerStrip').then(m => ({ default: m.PlateCredits })));

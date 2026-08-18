import { ParentImpact } from 'deliberate-frontend';

/** A supporting argument lifting its parent's rating. */
export const Lifts = () => <ParentImpact impact={0.17} />;

/** An objection pulling it down. */
export const Pulls = () => <ParentImpact impact={-0.71} />;

/** Refuted, or still a draft: it moves its parent by nothing at all. */
export const MovesNothing = () => <ParentImpact impact={0} />;

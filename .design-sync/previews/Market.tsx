import { Market } from 'deliberate-frontend';

/** What an argument's own market says, before its sub-arguments are counted. Takes the raw
    0..1 pro-share price and centers it, so an undecided market reads ±0%. */
export const Backed = () => <Market approval={0.9} />;

/** A market that has priced the argument down. */
export const Rejected = () => <Market approval={0.21} />;

/** The seed price of an untouched market. */
export const Undecided = () => <Market approval={0.5} />;

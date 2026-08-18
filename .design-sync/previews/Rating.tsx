import { Rating } from 'deliberate-frontend';

/** The debate's verdict on an argument, on the signed scale: green above neutral, rust below. */
export const Confirmed = () => <Rating rating={0.62} />;

/** Refuted - the sub-debate overruled the market. */
export const Refuted = () => <Rating rating={-0.3} />;

/** Dead even reads ±0%, never "half full". */
export const Undecided = () => <Rating rating={0} />;

/** Bare: the value alone, for compact rows like the ancestry rail. */
export const Bare = () => <Rating rating={0.62} bare />;

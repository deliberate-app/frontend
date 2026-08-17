import { VerdictMark } from 'deliberate-frontend';

/** The verdict line as the focus view renders it: stance color carried by the wrapper. */
export const Confirmed = () => (
  <p className="verdict verdict-approved">
    Thesis confirmed <VerdictMark approved />
  </p>
);

export const Objected = () => (
  <p className="verdict verdict-objected">
    Thesis objected <VerdictMark approved={false} />
  </p>
);

/** The compact browse-row form: the glyph alone in its reserved slot. */
export const BrowseRowMarks = () => (
  <span style={{ display: 'inline-flex', gap: '1rem', fontSize: '1.1rem' }}>
    <span className="verdict-mark verdict-approved" title="Thesis confirmed">
      <VerdictMark approved />
    </span>
    <span className="verdict-mark verdict-objected" title="Thesis objected">
      <VerdictMark approved={false} />
    </span>
  </span>
);

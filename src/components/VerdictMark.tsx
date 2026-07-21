type Props = { approved: boolean };

/**
 * The finished thesis outcome as a mark: the docs decision icon's rounded check when the thesis is
 * confirmed, a matching rounded cross when it is objected. Both share one stroke weight and rounded
 * caps; the color comes from the surrounding `.verdict-approved` / `.verdict-objected` class via
 * `currentColor` (pro-green / con-rust).
 */
export function VerdictMark({ approved }: Props) {
  return (
    <svg
      className="verdict-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {approved ? (
        <path d="M5 12.5 L10 17.5 L19.5 7" />
      ) : (
        <>
          <path d="M6.5 6.5 L17.5 17.5" />
          <path d="M17.5 6.5 L6.5 17.5" />
        </>
      )}
    </svg>
  );
}

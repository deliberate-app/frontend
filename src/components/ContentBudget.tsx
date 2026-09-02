import { contentBytes, MAX_CONTENT_BYTES } from '../lib/content';

/**
 * The byte budget for authored texts, always visible while composing. Bytes, not characters:
 * the chain counts UTF-8, so a text of umlauts runs out of room twice as fast as it looks.
 */
export function ContentBudget({ text }: { text: string }) {
  const bytes = contentBytes(text);
  return (
    <span className={`content-budget mono${bytes > MAX_CONTENT_BYTES ? ' content-budget-over' : ''}`}>
      {bytes}/{MAX_CONTENT_BYTES}
    </span>
  );
}

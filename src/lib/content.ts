/**
 * The bounds on authored text. The contract takes a thesis or argument as a string of 1 to
 * `MAX_CONTENT_BYTES` bytes of UTF-8 and publishes it in the creating call's event; nothing is
 * stored and nothing is content-addressed, so these bounds are the whole content pipeline.
 * Bytes rather than characters, because that is what the chain counts: an umlaut is two.
 */

/** Mirrors the contract's `Parameters.MAX_CONTENT_LENGTH`. */
export const MAX_CONTENT_BYTES = 256;

/** The UTF-8 length of a text - the length the contract's bound is on. */
export function contentBytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Why a text cannot be sent as content, or null when it can. The contract rejects the same
 * texts, at the price of a simulate round trip and a message in bytes; this says it first.
 */
export function contentError(text: string): string | null {
  const bytes = contentBytes(text);
  if (bytes === 0) {
    return 'The text is empty.';
  }
  if (bytes > MAX_CONTENT_BYTES) {
    return `The text is ${bytes} bytes; the chain takes at most ${MAX_CONTENT_BYTES}.`;
  }
  return null;
}

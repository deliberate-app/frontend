import { childrenOf, type ArgumentNode, type Debate } from '../types';

/**
 * What has been argued beneath a claim - `3 pro` and `2 con` set a gap apart, or `Undebated`
 * where nothing has been.
 *
 * The consequence of an argument, which is why it sits where the thesis' outcome sits - at the end
 * of the row, after the figures (principle 12) - and reads the same on a card as on the focused
 * claim. A draft shows nothing at all: nesting needs a locked-in parent, so there is no invitation
 * to make yet, and the countdown padlock beside it already says why.
 */
export function Replies({ debate, node, locked }: { debate: Debate; node: ArgumentNode; locked: boolean }) {
  const counted = [childrenOf(debate, node.id, 'pro').length, childrenOf(debate, node.id, 'con').length];
  const said = counted
    .map((count, index) => (count > 0 ? `${count} ${index === 0 ? 'pro' : 'con'}` : null))
    .filter((part) => part !== null);

  if (said.length === 0) {
    return locked ? <span className="replies">Undebated</span> : null;
  }
  return (
    <span className="replies facts">
      {said.map((part) => (
        <span key={part}>{part}</span>
      ))}
    </span>
  );
}

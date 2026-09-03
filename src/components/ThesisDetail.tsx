import { useMemo } from 'react';
import { ArgumentHistory } from './ArgumentHistory';
import { AddressChip } from './AddressChip';
import { historyOf, type StakeEvent } from '../lib/history';
import { signClassOf } from '../lib/impact';
import { formatSignedVotes, INITIAL_UNITS } from '../lib/votes';
import type { DebateParticipant } from '../data/source';
import { stakeWithDrafts, thesisOf, type Debate } from '../types';

/**
 * Everything about the debate as a whole, opened from the thesis' figures: how its rating and its
 * stake got where they are, the fee its markets ran on, and - once the tally has run - where each
 * participant stands. The thesis owns no market, so there are no reserves and no author to have
 * earned from them; what it has instead of those is the people.
 */
export function ThesisDetail({
  debate,
  stakes,
  participants,
  onClose,
}: {
  debate: Debate;
  /** Every stake the debate has seen; empty from a source that keeps no history. */
  stakes: readonly StakeEvent[];
  /** Every account that joined, most tokens first; empty from a source that keeps no list. */
  participants: readonly DebateParticipant[];
  onClose: () => void;
}) {
  const thesis = thesisOf(debate);
  const points = useMemo(() => historyOf(debate, stakes, thesis.id), [debate, stakes, thesis.id]);
  const finished = debate.phase === 'finished';

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Debate details"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">Debate details</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <ArgumentHistory
          points={points}
          totalDebateStake={stakeWithDrafts(debate)}
          ratingWindow={{
            opens: debate.timing?.editingEndTime ?? 0,
            closes: debate.timing?.ratingEndTime ?? 0,
          }}
          thesis
        />

        <dl className="detail-facts">
          <dt>Fee</dt>
          <dd>
            {debate.feePercentage > 0 ? (
              <>
                <span className="mono">{debate.feePercentage}%</span> of every stake, to the author
              </>
            ) : (
              'none'
            )}
          </dd>
        </dl>

        {/* Standings are what the tally leaves each participant with, so they are shown once it
            has run: before that a balance is only what has not been staked yet. */}
        {finished && participants.length > 0 ? (
          <table className="leaderboard">
            <caption>Standings</caption>
            <tbody>
              {participants.map((participant, index) => {
                const points = participant.tokens - INITIAL_UNITS;
                return (
                  <tr key={participant.account}>
                    <td className="leaderboard-rank mono">{index + 1}</td>
                    <td>
                      <AddressChip address={participant.account} />
                    </td>
                    <td className={`leaderboard-points mono ${signClassOf(points)}`}>
                      {formatSignedVotes(points)} ⬡
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="composer-hint">
            {finished ? 'No standings to show.' : 'Standings appear once the tally has run.'}
          </p>
        )}
        {finished && participants.length > 0 && (
          <p className="composer-hint">
            Points are vote tokens beyond the 100 granted on joining. Shares not yet redeemed do not
            count until they are.
          </p>
        )}
      </div>
    </div>
  );
}

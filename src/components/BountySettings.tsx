import { useState } from 'react';
import { isAddress } from 'viem';
import {
  BOUNTY_TOKEN_PRESETS,
  formatTokenAmount,
  parseTokenAmount,
  type TokenInfo,
} from '../lib/tokens';

/** A bounty as configured in the create form: the token's identity plus the raw amount. */
export interface BountyDraft {
  token: TokenInfo;
  amount: bigint;
}

/**
 * The bounty modal of the create form, mirroring the schedule settings' live-editing model:
 * preset token chips for the common cases, any ERC-20 by address, the amount in human units.
 * Changes apply live to the summary chip behind the modal; the cross and the backdrop close.
 */
export function BountySettings({
  bounty,
  onChange,
  onClose,
  resolveToken,
}: {
  bounty: BountyDraft | null;
  onChange: (bounty: BountyDraft | null) => void;
  onClose: () => void;
  /** Resolves a custom address to its token identity (chain read); absent in sample mode. */
  resolveToken?: (address: string) => Promise<TokenInfo>;
}) {
  const [amountText, setAmountText] = useState(() =>
    bounty && bounty.amount > 0n ? formatTokenAmount(bounty.amount, bounty.token).split(' ')[0] : '',
  );
  const [customAddress, setCustomAddress] = useState('');
  const [customBusy, setCustomBusy] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);

  /** Re-derives the raw amount whenever the token or the amount text changes. */
  const apply = (token: TokenInfo | null, text: string) => {
    setAmountError(null);
    if (!token) {
      onChange(null);
      return;
    }
    try {
      onChange({ token, amount: text.trim() === '' ? 0n : parseTokenAmount(text, token.decimals) });
    } catch {
      setAmountError('The amount is not a valid number for this token.');
      onChange({ token, amount: 0n });
    }
  };

  const pickCustom = async () => {
    setCustomError(null);
    if (!isAddress(customAddress)) {
      setCustomError('Not an address.');
      return;
    }
    if (!resolveToken) {
      setCustomError('Custom tokens need a chain connection.');
      return;
    }
    setCustomBusy(true);
    try {
      const token = await resolveToken(customAddress);
      apply(token, amountText);
    } catch {
      setCustomError('The address does not answer like an ERC-20.');
    } finally {
      setCustomBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Debate bounty"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">Bounty</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className="composer-hint">
          An ERC-20 prize for the debate&apos;s net winners - participants who end with more vote
          tokens than the initial grant. Unclaimed remainder returns to you after the 7-day claim
          window; anyone can top the pool up while the debate runs.
        </p>

        <div className="preset-row">
          <button
            type="button"
            className={`btn btn-small ${bounty === null ? 'preset-active' : ''}`}
            onClick={() => apply(null, amountText)}
          >
            None
          </button>
          {BOUNTY_TOKEN_PRESETS.map((token) => (
            <button
              key={token.address}
              type="button"
              className={`btn btn-small ${bounty?.token.address === token.address ? 'preset-active' : ''}`}
              onClick={() => apply(token, amountText)}
            >
              {token.symbol}
            </button>
          ))}
        </div>

        <label className="duration-field">
          <span className="duration-label">Custom token</span>
          <span className="duration-inputs">
            <input
              type="text"
              className="mono"
              placeholder="0x…"
              value={customAddress}
              onChange={(event) => setCustomAddress(event.target.value)}
              onBlur={() => void (customAddress.trim() !== '' && pickCustom())}
            />
          </span>
          <span className="duration-hint">
            {customBusy ? 'Reading the token…' : 'Any ERC-20 address; symbol and decimals are read from the chain.'}
          </span>
          {customError && <span className="action-error">{customError}</span>}
        </label>

        {bounty && (
          <label className="duration-field">
            <span className="duration-label">Amount</span>
            <span className="duration-inputs">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={amountText}
                onChange={(event) => {
                  setAmountText(event.target.value);
                  apply(bounty.token, event.target.value);
                }}
              />
              <span className="duration-unit-label">{bounty.token.symbol}</span>
            </span>
            <span className="duration-hint">
              Pulled from your wallet at creation (an approval is asked first); zero names the token
              and leaves the funding to top-ups.
            </span>
            {amountError && <span className="action-error">{amountError}</span>}
          </label>
        )}
      </div>
    </div>
  );
}

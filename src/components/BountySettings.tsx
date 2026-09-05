import { useState } from 'react';
import { Segmented } from './Choice';
import { isAddress } from 'viem';
import { BOUNTY_TOKEN_PRESETS, formatTokenAmount, parseTokenAmount, type TokenInfo } from '../lib/tokens';

/** A bounty as configured in the create form: the token's identity plus the raw amount. */
export interface BountyDraft {
  token: TokenInfo;
  amount: bigint;
}

/**
 * The bounty step: one track holding every state a bounty can be in - none, a known token, or any
 * ERC-20 by address - and the amount in human units.
 */
export function BountyFields({
  bounty,
  onChange,
  resolveToken,
}: {
  bounty: BountyDraft | null;
  onChange: (bounty: BountyDraft | null) => void;
  /** Resolves a custom address to its token identity (chain read); absent in sample mode. */
  resolveToken?: (address: string) => Promise<TokenInfo>;
}) {
  const [amountText, setAmountText] = useState(() =>
    bounty && bounty.amount > 0n ? formatTokenAmount(bounty.amount, bounty.token).split(' ')[0] : '',
  );
  // The reader can be on Custom before a token resolves, when there is no bounty to read it from.
  const [customChosen, setCustomChosen] = useState(
    bounty !== null && !BOUNTY_TOKEN_PRESETS.some((token) => token.address === bounty.token.address),
  );
  const [customAddress, setCustomAddress] = useState(customChosen && bounty ? bounty.token.address : '');
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
    <>
      <p className="composer-hint">Paid to participants who end with more vote tokens than they were granted.</p>

      <Segmented
        label="Bounty token"
        value={customChosen ? 'custom' : (bounty?.token.address ?? 'none')}
        onChange={(id) => {
          setCustomChosen(id === 'custom');
          if (id === 'custom') {
            // A custom token is the bounty only once its address resolves, so the one it replaces
            // goes now rather than lingering under a control that no longer names it.
            apply(null, amountText);
            if (customAddress.trim() !== '') void pickCustom();
            return;
          }
          apply(BOUNTY_TOKEN_PRESETS.find((preset) => preset.address === id) ?? null, amountText);
        }}
        options={[
          { id: 'none', label: 'None' },
          ...BOUNTY_TOKEN_PRESETS.map((token) => ({ id: token.address, label: token.symbol })),
          { id: 'custom', label: 'Custom' },
        ]}
      />

      <label className="duration-field" hidden={!customChosen}>
        <span className="duration-label">Token address</span>
        <input
          type="text"
          className="text-input mono"
          spellCheck={false}
          placeholder="0x…"
          value={customAddress}
          onChange={(event) => setCustomAddress(event.target.value)}
          onBlur={() => void (customAddress.trim() !== '' && pickCustom())}
        />
        <span className="duration-hint">{customBusy ? 'Reading the token…' : 'Any ERC-20 address.'}</span>
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
          <span className="duration-hint">Pulled from your wallet at creation; zero leaves it to top-ups.</span>
          {amountError && <span className="action-error">{amountError}</span>}
        </label>
      )}
    </>
  );
}

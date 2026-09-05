import type { ReactNode } from 'react';

/**
 * How the app asks a reader to choose, in four elements with four jobs. They are here together
 * because the difference between them is the whole point: one element per meaning, so a reader who
 * learns one place learns them all.
 *
 * - `Tabs` change what you are looking at. They never change a value by themselves.
 * - `Segmented` is one value with a few named states. The filled cell is the state.
 * - `Presets` are verbs. They write values into the fields below, which you are then free to edit,
 *   so a preset is never a state you are in.
 * - `PickRow` is one candidate in a list too long or too wordy for segments.
 *
 * `CurrentDot` is the one mark shared across them: your current state is here. It sits on the tab
 * holding the choice and on the preset the values still match, and it goes out the moment that
 * stops being true - which is why a preset needs no other highlight.
 */
export function CurrentDot() {
  return <span className="current-dot" aria-hidden="true" />;
}

/**
 * A rail of places. Selecting a tab shows its panel and nothing else - a reader can look through
 * every tab and change nothing - so a host that keeps a choice marks the tab holding it.
 */
export function Tabs<Id extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: ReadonlyArray<{
    id: Id;
    label: string;
    /** The reader's current choice lives in this tab. */ current?: boolean;
  }>;
  active: Id;
  onSelect: (id: Id) => void;
}) {
  return (
    <div className="tab-row" role="tablist">
      {tabs.map(({ id, label, current }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={id === active}
          className={`tab ${id === active ? 'tab-active' : ''}`}
          onClick={() => onSelect(id)}
        >
          {label}
          {current && <CurrentDot />}
        </button>
      ))}
    </div>
  );
}

/** One value with a few named states, in one enclosed track. The filled cell is the state. */
export function Segmented<Id extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ id: Id; label: string; title?: string }>;
  value: Id;
  onChange: (id: Id) => void;
  /** Names the control for a screen reader, which cannot read the label beside it. */
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(({ id, label: text, title }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={id === value}
          title={title}
          className={`segment ${id === value ? 'segment-active' : ''}`}
          onClick={() => onChange(id)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * Shortcuts that fill in the fields below. A preset carries the dot while the fields still match
 * it, and loses it on the first edit, because a preset is something you did and not somewhere you
 * are.
 */
export function Presets({
  presets,
}: {
  presets: ReadonlyArray<{
    name: string;
    /** The fields still hold exactly this preset. */ current: boolean;
    onApply: () => void;
  }>;
}) {
  return (
    <div className="preset-row">
      {presets.map(({ name, current, onApply }) => (
        <button key={name} type="button" className={`preset ${current ? 'preset-current' : ''}`} onClick={onApply}>
          {name}
          {current && <CurrentDot />}
        </button>
      ))}
    </div>
  );
}

/**
 * One candidate on a list: what kind it is, what it is, and where to find it.
 *
 * Two marks, because a row can be two things at once. `chosen` is what the reader has settled on.
 * `current` is what they are looking at, which for a list with contents of its own - an allowlist
 * and its members - is not the same question.
 */
export function PickRow({
  kind,
  label,
  note,
  chosen,
  current,
  onChoose,
}: {
  kind: string;
  label: ReactNode;
  note?: ReactNode;
  chosen?: boolean;
  current?: boolean;
  /** Absent where the row is only telling the reader something. */
  onChoose?: () => void;
}) {
  const marks = `${chosen ? ' pick-row-chosen' : ''}${current ? ' pick-row-current' : ''}`;
  const body = (
    <>
      <span className="pick-row-kind">{kind}</span>
      <span>{label}</span>
      {note && <span className="pick-row-note">{note}</span>}
      {chosen && <CurrentDot />}
    </>
  );
  return onChoose ? (
    <button type="button" className={`pick-row${marks}`} onClick={onChoose}>
      {body}
    </button>
  ) : (
    <div className={`pick-row pick-row-static${marks}`}>{body}</div>
  );
}

import type { ReactNode } from 'react';

/**
 * How the app asks a reader to choose, in four elements with four jobs. They are here together
 * because the difference between them is the whole point: one element per meaning, so a reader who
 * learns one place learns them all.
 *
 * - `Tabs` change what you are looking at. They never change a value by themselves.
 * - `Segmented` is one value with a few named states. The filled cell is the state.
 * - `Presets` are verbs. They write values into the fields below, which you are then free to edit,
 *   and the filled chip is the one the fields still match.
 * - `PickRow` is one candidate in a list too long or too wordy for segments.
 * - `Steps` is an ordered walk through a form, numbered because the order carries meaning.
 *
 * What tells them apart is their shape, not their fill: chips with gaps between them, one enclosed
 * track, a hairline rail. Each is therefore free to mark its own choice by filling it, which is the
 * one mark that takes no width and so leaves the controls beside it where they were.
 */

/** A rail of places. Selecting a tab shows its panel; what a panel then does is its own. */
export function Tabs<Id extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: ReadonlyArray<{ id: Id; label: string }>;
  active: Id;
  onSelect: (id: Id) => void;
}) {
  return (
    <div className="tab-row" role="tablist">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={id === active}
          className={`tab ${id === active ? 'tab-active' : ''}`}
          onClick={() => onSelect(id)}
        >
          {label}
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
 * Shortcuts that fill in the fields below. The filled chip is the preset the fields still hold, and
 * the first edit under it puts the fill out, because a preset lasts only as long as nothing it
 * wrote has moved.
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
  sub,
  chosen,
  current,
  onChoose,
}: {
  kind: string;
  label: ReactNode;
  /** A short aside at the trailing edge of the first line. */
  note?: ReactNode;
  /** A second line under the label, for what is too long to sit beside it - a whole address. */
  sub?: ReactNode;
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
      {sub && <span className="pick-row-sub">{sub}</span>}
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

/**
 * The steps of a form taken in order. Numbered, because unlike tabs the order is part of what the
 * reader is being told, and marked rather than underlined so a step rail never reads as a tab rail
 * - the two can sit in one dialog, as the participants step does.
 *
 * Every step stays reachable. Each one carries a default, so none of them can be left unanswered,
 * and a reader who wants to change something three steps back should not have to walk forward
 * again to get there.
 */
export function Steps({
  steps,
  active,
  onSelect,
}: {
  steps: readonly string[];
  active: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ol className="step-row">
      {steps.map((label, index) => (
        <li key={label}>
          <button
            type="button"
            className={`step ${index === active ? 'step-current' : index < active ? 'step-done' : ''}`}
            aria-current={index === active ? 'step' : undefined}
            onClick={() => onSelect(index)}
          >
            <span className="step-mark">{index + 1}</span>
            {label}
          </button>
        </li>
      ))}
    </ol>
  );
}

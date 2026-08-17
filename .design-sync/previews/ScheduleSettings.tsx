import { ScheduleSettings } from 'deliberate-frontend';

const noop = () => {};

/** A transform-containing frame anchors the modal's fixed backdrop inside the card. */
const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ transform: 'translateZ(0)', width: 540, height: 820, position: 'relative' }}>{children}</div>
);

/** The default schedule (locking 30m · editing 1d · rating 12h) with the preset row. */
export const Default = () => (
  <Frame>
    <ScheduleSettings
      schedule={{ lockingDuration: 1_800, editingDuration: 86_400, ratingDuration: 43_200 }}
      onChange={noop}
      onClose={noop}
    />
  </Frame>
);

/** A schedule the contract would reject: the blocking error under the fields. */
export const InvalidTooShort = () => (
  <Frame>
    <ScheduleSettings
      schedule={{ lockingDuration: 1_800, editingDuration: 900, ratingDuration: 600 }}
      onChange={noop}
      onClose={noop}
    />
  </Frame>
);

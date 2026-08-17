import { ContentText } from 'deliberate-frontend';

/** Resolved content: the text renders bare, exactly as its heading styles it. */
export const Resolved = () => (
  <h1 className="focus-text">
    <ContentText text="Teenagers demonstrably learn better after nine." />
  </h1>
);

/**
 * Unresolvable content: the on-chain digest stands in, shortened and linking to the
 * `ipfs://` URI so a gateway-independent browser can still try to fetch it.
 */
export const UnresolvedDigest = () => (
  <h1 className="focus-text">
    <ContentText
      text=""
      digest="0x2a3a7c1f9b4e5d6a8c0f2e4b6d8a1c3e5f7b9d0a2c4e6f8b1d3a5c7e9f0b2683"
    />
  </h1>
);

/** Both, in body type: the missing-content link is the only visual difference. */
export const ResolvedVersusMissing = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
    <p>
      <ContentText text="Buses and parent schedules cannot absorb a later start." />
    </p>
    <p>
      <ContentText text="" digest="0x91b40c7ae2f8d15630a9c4b7e08d2f6a35c1e97b40d82f6a15c3e97b40d82f6a" />
    </p>
  </div>
);

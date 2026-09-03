import { useId, type ReactNode } from 'react';

/**
 * The one dialog the app has: a backdrop that closes it, a heading that names it, and a cross.
 *
 * The heading is the dialog's accessible name, by reference rather than by repetition: written
 * once here, it cannot drift from what a screen reader announces - which it had, in one of the
 * eight copies of this scaffolding that used to name themselves twice. Informational and
 * live-editing dialogs alike have the cross and the backdrop as their exits (principle 6); what
 * a dialog does with its contents is its own.
 */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

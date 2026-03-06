import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Styled confirmation dialog that replaces window.confirm().
 *
 * Props:
 *   open        — boolean, whether the modal is visible
 *   title       — heading text (e.g. "Unmount /dev/sda1?")
 *   message     — optional body text
 *   confirmText — label for the confirm button (default "Confirm")
 *   variant     — 'danger' | 'warning' (default 'danger')
 *   onConfirm   — called when user clicks confirm
 *   onCancel    — called when user clicks cancel or presses Escape
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmText = 'Confirm',
  variant = 'danger',
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const btnColor =
    variant === 'danger'
      ? 'bg-gb-red hover:bg-gb-red-dim text-gb-bg0-hard border-gb-red-dim'
      : 'bg-gb-yellow hover:bg-gb-yellow-dim text-gb-bg0-hard border-gb-yellow-dim';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gb-bg1 border-2 border-gb-bg3 shadow-xl max-w-sm w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={22} className={variant === 'danger' ? 'text-gb-red mt-0.5' : 'text-gb-yellow mt-0.5'} />
          <div>
            <h3 className="text-gb-fg font-semibold text-base">{title}</h3>
            {message && <p className="text-gb-fg3 text-sm mt-1">{message}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm font-bold uppercase bg-gb-bg3 hover:bg-gb-bg4 text-gb-fg border-2 border-gb-bg4 transition-colors"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-4 py-1.5 text-sm font-bold uppercase border-2 transition-colors ${btnColor}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title: string;
  itemName: string;
  itemType: string;
  onClose: () => void;
  onConfirm: () => Promise<{ success: boolean; error?: string | null }>;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  title,
  itemName,
  itemType,
  onClose,
  onConfirm,
}) => {
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      const res = await onConfirm();
      if (!res.success) {
        setError(res.error || `Failed to remove this ${itemType}.`);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during deletion.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-slate-900">{itemName}</span>?
              This action cannot be undone. Records referenced by active cohorts or attendance sessions cannot be deleted.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <p className="font-semibold">Deletion Blocked</p>
            <p className="mt-0.5">{error}</p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Confirm & Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};

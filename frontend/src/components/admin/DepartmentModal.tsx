import React, { useState, useEffect } from 'react';
import { X, Building2, Loader2, AlertCircle } from 'lucide-react';
import type { Department, CreateDepartmentInput } from '../../types';

interface DepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateDepartmentInput) => Promise<{ success: boolean; error?: string | null }>;
  department?: Department | null;
}

export const DepartmentModal: React.FC<DepartmentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  department,
}) => {
  const [code, setCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (department) {
      setCode(department.code);
      setName(department.name);
    } else {
      setCode('');
      setName('');
    }
    setError(null);
  }, [department, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();

    if (!trimmedCode) {
      setError('Department code is required (e.g. CSE, ECE).');
      return;
    }

    if (!trimmedName) {
      setError('Department name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onSave({ code: trimmedCode, name: trimmedName });
      if (!res.success) {
        setError(res.error || 'Failed to save department.');
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {department ? 'Edit Department' : 'Create Department'}
              </h3>
              <p className="text-xs text-slate-500">Academic Department Record</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
              Department Code *
            </label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. CSE, ECE, MECH"
              maxLength={20}
              className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20 font-mono"
            />
            <p className="mt-1 text-[11px] text-slate-400">Must be unique across the institution.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
              Department Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Computer Science and Engineering"
              maxLength={255}
              className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-60 transition-colors"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{department ? 'Update Department' : 'Create Department'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

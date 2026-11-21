import React, { useState, useEffect } from 'react';
import { X, BookOpen, Loader2, AlertCircle } from 'lucide-react';
import type { Subject, CreateSubjectInput, Department } from '../../types';

interface SubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateSubjectInput) => Promise<{ success: boolean; error?: string | null }>;
  departments: Department[];
  subject?: Subject | null;
}

export const SubjectModal: React.FC<SubjectModalProps> = ({
  isOpen,
  onClose,
  onSave,
  departments,
  subject,
}) => {
  const [departmentId, setDepartmentId] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [credits, setCredits] = useState<number>(3);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (subject) {
      setDepartmentId(subject.department_id);
      setCode(subject.code);
      setName(subject.name);
      setCredits(subject.credits);
    } else {
      setDepartmentId(departments.length > 0 ? departments[0].id : '');
      setCode('');
      setName('');
      setCredits(3);
    }
    setError(null);
  }, [subject, departments, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();

    if (!departmentId) {
      setError('Please select a department for this subject.');
      return;
    }

    if (!trimmedCode) {
      setError('Subject code is required (e.g. CS301, EC202).');
      return;
    }

    if (!trimmedName) {
      setError('Subject title is required.');
      return;
    }

    if (isNaN(credits) || credits <= 0) {
      setError('Credits must be a positive integer (e.g. 3 or 4).');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onSave({
        department_id: departmentId,
        code: trimmedCode,
        name: trimmedName,
        credits,
      });
      if (!res.success) {
        setError(res.error || 'Failed to save subject.');
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
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {subject ? 'Edit Subject' : 'Create Subject'}
              </h3>
              <p className="text-xs text-slate-500">Curriculum Course Record</p>
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
              Offering Department *
            </label>
            <select
              required
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
            >
              <option value="" disabled>
                Select department...
              </option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  [{dept.code}] {dept.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Subject Code *
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. CS301"
                maxLength={50}
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Credits *
              </label>
              <input
                type="number"
                required
                min={1}
                max={10}
                value={credits}
                onChange={(e) => setCredits(Math.max(1, parseInt(e.target.value) || 1))}
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
              Subject Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Computer Networks"
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
              <span>{subject ? 'Update Subject' : 'Create Subject'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

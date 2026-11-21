import React, { useState, useEffect } from 'react';
import { X, GraduationCap, Loader2, AlertCircle } from 'lucide-react';
import type { AcademicClass, CreateClassInput, Department } from '../../types';

interface ClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateClassInput) => Promise<{ success: boolean; error?: string | null }>;
  departments: Department[];
  academicClass?: AcademicClass | null;
}

export const ClassModal: React.FC<ClassModalProps> = ({
  isOpen,
  onClose,
  onSave,
  departments,
  academicClass,
}) => {
  const [departmentId, setDepartmentId] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [academicYear, setAcademicYear] = useState<string>('2025-2026');
  const [semester, setSemester] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (academicClass) {
      setDepartmentId(academicClass.department_id);
      setName(academicClass.name);
      setAcademicYear(academicClass.academic_year);
      setSemester(academicClass.semester);
    } else {
      setDepartmentId(departments.length > 0 ? departments[0].id : '');
      setName('');
      setAcademicYear('2025-2026');
      setSemester(1);
    }
    setError(null);
  }, [academicClass, departments, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedYear = academicYear.trim();

    if (!departmentId) {
      setError('Please select a department for this class.');
      return;
    }

    if (!trimmedName) {
      setError('Class name is required (e.g. CSE-3A, Section 1).');
      return;
    }

    if (!trimmedYear) {
      setError('Academic year is required (e.g. 2025-2026).');
      return;
    }

    if (semester < 1 || semester > 8) {
      setError('Semester must be between 1 and 8.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onSave({
        department_id: departmentId,
        name: trimmedName,
        academic_year: trimmedYear,
        semester,
      });
      if (!res.success) {
        setError(res.error || 'Failed to save class.');
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
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {academicClass ? 'Edit Class & Section' : 'Create Class & Section'}
              </h3>
              <p className="text-xs text-slate-500">Academic Cohort Configuration</p>
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
              Department *
            </label>
            <select
              required
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
            >
              <option value="" disabled>
                Select a department...
              </option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  [{dept.code}] {dept.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
              Class / Section Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. B.Tech CSE - 3A"
              maxLength={100}
              className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Academic Year *
              </label>
              <input
                type="text"
                required
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2025-2026"
                maxLength={20}
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Semester (1–8) *
              </label>
              <select
                value={semester}
                onChange={(e) => setSemester(Number(e.target.value))}
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>
                    Semester {s}
                  </option>
                ))}
              </select>
            </div>
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
              <span>{academicClass ? 'Update Class' : 'Create Class'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

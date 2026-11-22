import React, { useState, useEffect } from 'react';
import { X, Users, Loader2, AlertCircle } from 'lucide-react';
import type { Department, FacultyMember, ProvisionFacultyInput, UpdateFacultyInput } from '../../types';

interface ProvisionFacultyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ProvisionFacultyInput | UpdateFacultyInput) => Promise<{ success: boolean; error?: string | null }>;
  departments: Department[];
  faculty?: FacultyMember | null;
}

export const ProvisionFacultyModal: React.FC<ProvisionFacultyModalProps> = ({
  isOpen,
  onClose,
  onSave,
  departments,
  faculty,
}) => {
  const [email, setEmail] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [facultyIdNumber, setFacultyIdNumber] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [designation, setDesignation] = useState<string>('Assistant Professor');
  const [initialPassword, setInitialPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmail(faculty?.email || '');
    setFullName(faculty?.full_name || '');
    setFacultyIdNumber(faculty?.faculty_id_number || '');
    setDepartmentId(faculty?.department_id || (departments.length > 0 ? departments[0].id : ''));
    setDesignation(faculty?.designation || 'Assistant Professor');
    setInitialPassword('');
    setError(null);
  }, [isOpen, departments, faculty]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!departmentId) {
      setError('Please select an academic department.');
      return;
    }

    if (!email.trim() || !fullName.trim() || !facultyIdNumber.trim() || !designation.trim()) {
      setError('All required fields must be filled.');
      return;
    }

    if (initialPassword && initialPassword.length < 8) {
      setError('Initial password must be at least 8 characters if provided.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = faculty
        ? await onSave({
            full_name: fullName.trim(),
            faculty_id_number: facultyIdNumber.trim(),
            department_id: departmentId,
            designation: designation.trim(),
          })
        : await onSave({
            email: email.trim().toLowerCase(),
            full_name: fullName.trim(),
            faculty_id_number: facultyIdNumber.trim(),
            department_id: departmentId,
            designation: designation.trim(),
            initial_password: initialPassword.trim() || undefined,
          });

      if (!res.success) {
        setError(res.error || 'Failed to provision faculty account.');
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
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{faculty ? 'Edit Faculty Member' : 'Provision Faculty Member'}</h3>
              <p className="text-xs text-slate-500">{faculty ? 'Update Academic Teaching Profile' : 'Create Academic Teaching Profile & Auth Account'}</p>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. Alan Turing"
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Institutional Email *
              </label>
              <input
                type="email"
                required
                readOnly={Boolean(faculty)}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alan.turing@univ.edu"
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Faculty ID Code *
              </label>
              <input
                type="text"
                required
                value={facultyIdNumber}
                onChange={(e) => setFacultyIdNumber(e.target.value)}
                placeholder="FAC-2024-001"
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Academic Department *
              </label>
              <select
                required
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
              >
                <option value="" disabled>Select department...</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    [{dept.code}] {dept.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Designation *
              </label>
              <input
                type="text"
                required
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="e.g. Professor, Assistant Professor"
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Initial Password (Optional)
              </label>
              <input
                type="text"
                value={initialPassword}
                onChange={(e) => setInitialPassword(e.target.value)}
                placeholder="Leave blank to auto-generate"
                minLength={8}
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20 font-mono text-xs"
              />
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
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-60 transition-colors"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Provision Faculty</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

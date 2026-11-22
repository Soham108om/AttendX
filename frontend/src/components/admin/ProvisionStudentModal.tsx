import React, { useState, useEffect } from 'react';
import { X, GraduationCap, Loader2, AlertCircle } from 'lucide-react';
import type { AcademicClass, StudentMember, ProvisionStudentInput, UpdateStudentInput, ProvisionedCredentialData } from '../../types';

interface ProvisionStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ProvisionStudentInput | UpdateStudentInput) => Promise<{ success: boolean; data?: ProvisionedCredentialData; error?: string | null }>;
  classes: AcademicClass[];
  student?: StudentMember | null;
}

export const ProvisionStudentModal: React.FC<ProvisionStudentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  classes,
  student,
}) => {
  const [email, setEmail] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [registrationNumber, setRegistrationNumber] = useState<string>('');
  const [rollNumber, setRollNumber] = useState<string>('');
  const [classId, setClassId] = useState<string>('');
  const [initialPassword, setInitialPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmail(student?.email || '');
    setFullName(student?.full_name || '');
    setRegistrationNumber(student?.registration_number || '');
    setRollNumber(student?.roll_number || '');
    setClassId(student?.class_id || (classes.length > 0 ? classes[0].id : ''));
    setInitialPassword('');
    setError(null);
  }, [isOpen, classes, student]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!classId) {
      setError('Please select an academic class cohort.');
      return;
    }

    if (!email.trim() || !fullName.trim() || !registrationNumber.trim() || !rollNumber.trim()) {
      setError('All required student fields must be provided.');
      return;
    }

    if (initialPassword && initialPassword.length < 8) {
      setError('Initial password must be at least 8 characters if specified.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = student
        ? await onSave({
            full_name: fullName.trim(),
            registration_number: registrationNumber.trim(),
            roll_number: rollNumber.trim(),
            class_id: classId,
          })
        : await onSave({
            email: email.trim().toLowerCase(),
            full_name: fullName.trim(),
            registration_number: registrationNumber.trim(),
            roll_number: rollNumber.trim(),
            class_id: classId,
            initial_password: initialPassword.trim() || undefined,
          });

      if (!res.success) {
        setError(res.error || 'Failed to provision student account.');
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
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{student ? 'Edit Student' : 'Provision Student'}</h3>
              <p className="text-xs text-slate-500">{student ? 'Update Student Profile & Class Roster' : 'Create Student Profile, Roster Entry & Auth Account'}</p>
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
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Sanika Patwardhan"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              readOnly={Boolean(student)}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. student@college.edu"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Roll Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                placeholder="e.g. 21CS042"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Registration Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                placeholder="e.g. REG-2023-CS-042"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Class Cohort & Section <span className="text-red-500">*</span>
            </label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              {classes.length === 0 ? (
                <option value="">No classes available — create a class first</option>
              ) : (
                classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.academic_year} — Sem {cls.semester})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Initial Password <span className="text-slate-400 font-normal">(Optional — Leave blank to auto-generate)</span>
            </label>
            <input
              type="text"
              value={initialPassword}
              onChange={(e) => setInitialPassword(e.target.value)}
              placeholder="Leave blank for secure auto-generation"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
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
              disabled={isSubmitting || classes.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Provisioning Account...</span>
                </>
              ) : (
                <span>Provision Student</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

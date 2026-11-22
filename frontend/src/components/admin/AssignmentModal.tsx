import React, { useState, useEffect } from 'react';
import { X, BookOpen, Loader2, AlertCircle } from 'lucide-react';
import type { AcademicClass, Subject, FacultyMember, CreateAssignmentInput } from '../../types';

interface AssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateAssignmentInput) => Promise<{ success: boolean; error?: string | null }>;
  faculty: FacultyMember[];
  subjects: Subject[];
  classes: AcademicClass[];
}

export const AssignmentModal: React.FC<AssignmentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  faculty,
  subjects,
  classes,
}) => {
  const [facultyId, setFacultyId] = useState<string>('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [classId, setClassId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFacultyId(faculty.length > 0 ? faculty[0].id : '');
    setSubjectId(subjects.length > 0 ? subjects[0].id : '');
    setClassId(classes.length > 0 ? classes[0].id : '');
    setError(null);
  }, [isOpen, faculty, subjects, classes]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!facultyId || !subjectId || !classId) {
      setError('Please select a faculty member, subject, and class.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onSave({
        faculty_id: facultyId,
        subject_id: subjectId,
        class_id: classId,
      });

      if (!res.success) {
        setError(res.error || 'Failed to create academic assignment.');
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
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Assign Faculty to Course</h3>
              <p className="text-xs text-slate-500">Allocate Teaching Staff to Subject & Class Cohort</p>
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
              Faculty Member <span className="text-red-500">*</span>
            </label>
            <select
              value={facultyId}
              onChange={(e) => setFacultyId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
            >
              {faculty.length === 0 ? (
                <option value="">No faculty available — provision faculty first</option>
              ) : (
                faculty.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.full_name || 'Faculty Member'} ({f.faculty_id_number} — {f.designation})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Academic Subject <span className="text-red-500">*</span>
            </label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
            >
              {subjects.length === 0 ? (
                <option value="">No subjects available — create subjects first</option>
              ) : (
                subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.code}] {s.name} ({s.credits} Credits)
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Class Cohort / Section <span className="text-red-500">*</span>
            </label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
            >
              {classes.length === 0 ? (
                <option value="">No classes available — create classes first</option>
              ) : (
                classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.academic_year} — Sem {c.semester})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="rounded-xl bg-purple-50/60 p-3 text-[11px] text-purple-800 border border-purple-100">
            <strong>Assignment Rule:</strong> The database enforces unique combinations of Faculty, Subject, and Class. A faculty member can only be assigned once to the same subject and class.
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
              disabled={isSubmitting || faculty.length === 0 || subjects.length === 0 || classes.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Creating Allocation...</span>
                </>
              ) : (
                <span>Assign Course</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

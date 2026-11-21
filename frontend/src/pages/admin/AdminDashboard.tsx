import React from 'react';
import { 
  Building2, 
  Users, 
  GraduationCap, 
  BookOpen, 
  ShieldCheck, 
  FileText,
  Clock
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const AdminDashboard: React.FC = () => {
  const { profile } = useAuth();

  return (
    <div className="space-y-6">
      {/* Welcome & Role Card */}
      <div className="rounded-2xl border border-purple-100 bg-gradient-to-r from-purple-50/70 via-white to-blue-50/50 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Full System Administration</span>
            </div>
            <h2 className="mt-2 text-xl font-bold text-slate-900">
              Welcome back, {profile?.full_name || 'Administrator'}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Academic structure control, department configurations, and institutional auditing.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-white border border-slate-200 px-3.5 py-2 rounded-xl shadow-xs">
            <Clock className="h-4 w-4 text-purple-600" />
            <span>Session: Active & Verified</span>
          </div>
        </div>
      </div>

      {/* Module Navigation Placeholders (Scheduled for Phase 4) */}
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
          Administration Modules (Phase 4 Foundation)
        </h3>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* Department & Class Management */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-purple-300 transition-colors">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
              <Building2 className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-base font-bold text-slate-900">Departments & Classes</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Manage academic departments, academic years, semesters, and class section rosters.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-purple-600">
              <span>Configured in Phase 4</span>
            </div>
          </div>

          {/* Faculty Management & Allocations */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-purple-300 transition-colors">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Users className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-base font-bold text-slate-900">Faculty Management</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Register faculty profiles, assign course codes, and allocate class section schedules.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">
              <span>Configured in Phase 4</span>
            </div>
          </div>

          {/* Student Registrations */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-purple-300 transition-colors">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <GraduationCap className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-base font-bold text-slate-900">Student Directory</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Manage student roll numbers, section enrollments, and monitor biometric enrollment status.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
              <span>Configured in Phase 4</span>
            </div>
          </div>

          {/* Curriculum & Subjects */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-purple-300 transition-colors">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <BookOpen className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-base font-bold text-slate-900">Curriculum & Subjects</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Maintain subject catalog, credit weights, and course syllabus mappings.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <span>Configured in Phase 4</span>
            </div>
          </div>

          {/* Immutable Audit Logs */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-purple-300 transition-colors">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
              <FileText className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-base font-bold text-slate-900">Security Audit Logs</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Review tamper-proof ledger tracking biometric alterations, attendance adjustments, and finalizations.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600">
              <span>Configured in Phase 7</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

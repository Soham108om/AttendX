import React from 'react';
import { 
  GraduationCap, 
  Calendar, 
  Fingerprint, 
  HelpCircle, 
  TrendingUp, 
  Shield, 
  Clock
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const StudentDashboard: React.FC = () => {
  const { profile } = useAuth();

  return (
    <div className="space-y-6">
      {/* Welcome & Role Card */}
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/70 via-white to-sky-50/50 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
              <GraduationCap className="h-3.5 w-3.5" />
              <span>Enrolled Student Portal</span>
            </div>
            <h2 className="mt-2 text-xl font-bold text-slate-900">
              Welcome, {profile?.full_name || 'Student'}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Track your verified course attendance, review biometric consent, and submit attendance correction requests.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-white border border-slate-200 px-3.5 py-2 rounded-xl shadow-xs">
            <Clock className="h-4 w-4 text-blue-600" />
            <span>Session: Active & Verified</span>
          </div>
        </div>
      </div>

      {/* Module Navigation Placeholders (Scheduled for Phase 5-7) */}
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
          Student Services (Phase 5–7 Foundation)
        </h3>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* My Attendance Analytics */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 transition-colors">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <TrendingUp className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-base font-bold text-slate-900">Attendance Analytics</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Subject-wise attendance percentages, monthly timeline trends, and eligibility status alerts.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">
              <span>Configured in Phase 7</span>
            </div>
          </div>

          {/* Biometric Consent & Right-to-be-Forgotten */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 transition-colors">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <Fingerprint className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-base font-bold text-slate-900">Biometric Governance</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Review biometric data consent, inspect vector template status, or execute right-to-be-forgotten deletion.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600">
              <span>Configured in Phase 5</span>
            </div>
          </div>

          {/* Daily Attendance Log */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 transition-colors">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <Calendar className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-base font-bold text-slate-900">Attendance History</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Detailed chronological records showing date, time, subject code, recognized status, and session notes.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
              <span>Configured in Phase 7</span>
            </div>
          </div>

          {/* Attendance Grievance / Correction Request */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 transition-colors">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <HelpCircle className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-base font-bold text-slate-900">Dispute & Corrections</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Submit a formal attendance dispute with reason documentation for classes marked absent in error.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600">
              <span>Configured in Phase 7</span>
            </div>
          </div>

          {/* Privacy & RLS Protection Badge */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 transition-colors">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Shield className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-base font-bold text-slate-900">Privacy Protection</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Your attendance and biometric vectors are strictly isolated via Supabase Row Level Security.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <span>RLS Enforced</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

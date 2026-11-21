import React from 'react';
import { 
  Camera, 
  CalendarCheck, 
  History, 
  FileCheck2, 
  Users, 
  Clock
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const FacultyDashboard: React.FC = () => {
  const { profile } = useAuth();

  return (
    <div className="space-y-6">
      {/* Welcome & Role Card */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-white to-blue-50/50 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">
              <Camera className="h-3.5 w-3.5" />
              <span>Faculty Attendance Portal</span>
            </div>
            <h2 className="mt-2 text-xl font-bold text-slate-900">
              Welcome, Prof. {profile?.full_name || 'Faculty Member'}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Conduct live webcam facial recognition scanning, review real-time matches, and finalize attendance sessions.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-white border border-slate-200 px-3.5 py-2 rounded-xl shadow-xs">
            <Clock className="h-4 w-4 text-indigo-600" />
            <span>Session: Active & Verified</span>
          </div>
        </div>
      </div>

      {/* Module Navigation Placeholders (Scheduled for Phase 6-7) */}
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
          Faculty Workflows (Phase 6–7 Foundation)
        </h3>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* Live Attendance Session */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-indigo-300 transition-colors">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <Camera className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-base font-bold text-slate-900">Live Attendance Session</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Launch real-time webcam facial detection and vectorized recognition for scheduled class periods.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
              <span>Configured in Phase 6</span>
            </div>
          </div>

          {/* Assigned Classes & Sections */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-indigo-300 transition-colors">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Users className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-base font-bold text-slate-900">Assigned Classes</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              View student rosters and registered biometrics for sections and subjects assigned to you.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">
              <span>Configured in Phase 6</span>
            </div>
          </div>

          {/* Two-Stage Reconciliation */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-indigo-300 transition-colors">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
              <FileCheck2 className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-base font-bold text-slate-900">Session Review & Finalize</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Review flagged/uncertain detections, perform manual status overrides with audit reasons, and seal the session.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-purple-600">
              <span>Configured in Phase 7</span>
            </div>
          </div>

          {/* Past Sessions History */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-indigo-300 transition-colors">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <History className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-base font-bold text-slate-900">Attendance Sheets</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Browse historical attendance records, export CSV compliance reports, and audit attendance statistics.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <span>Configured in Phase 7</span>
            </div>
          </div>

          {/* Student Dispute Reviews */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-indigo-300 transition-colors">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <CalendarCheck className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-base font-bold text-slate-900">Correction Requests</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Evaluate and approve/reject attendance dispute claims submitted by students with formal audit reasoning.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600">
              <span>Configured in Phase 7</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

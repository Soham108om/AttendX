import React, { useEffect, useState } from 'react';
import { 
  GraduationCap, 
  ShieldCheck, 
  Server, 
  CheckCircle2, 
  AlertTriangle,
  Camera, 
  Database,
  ArrowRight
} from 'lucide-react';
import { isSupabaseConfigured } from '../services/supabase';

interface BackendHealth {
  status: string;
  service: string;
}

export const LandingPage: React.FC = () => {
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
  // Standard root health check
  const healthEndpoint = apiBaseUrl.replace('/api/v1', '/health');

  const checkHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch(healthEndpoint);
      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status}`);
      }
      const data: BackendHealth = await res.json();
      setBackendHealth(data);
    } catch {
      setBackendHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Hero Section */}
      <div className="rounded-3xl border border-blue-100 bg-gradient-to-b from-blue-50/60 to-white p-8 sm:p-12 shadow-sm text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          <span>Problem Statement 18</span>
          <span>•</span>
          <span>Final Jury Demonstration Ready</span>
        </div>
        
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Smart Attendance via <span className="text-blue-600">Face Recognition</span>
        </h1>
        
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
          AttendX is a high-reliability, role-based academic attendance platform powered by
          edge-optimized facial detection, vector similarity, and transactional verification.
        </p>

        {/* System Foundation Health Cards */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-xl mx-auto text-left">
          {/* Backend Status Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Server className="h-4 w-4 text-blue-600" />
                FastAPI Backend
              </span>
              {loading ? (
                <span className="text-xs text-slate-400">Probing...</span>
              ) : backendHealth?.status === 'healthy' ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Standby
                </span>
              )}
            </div>
            <p className="mt-2 text-sm font-bold text-slate-800">
              {backendHealth ? `${backendHealth.service} (${backendHealth.status})` : 'Awaiting Connection'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {healthEndpoint}
            </p>
          </div>

          {/* Database / Supabase Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Database className="h-4 w-4 text-blue-600" />
                Supabase Auth & DB
              </span>
              {isSupabaseConfigured ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400">
                  Env Template
                </span>
              )}
            </div>
            <p className="mt-2 text-sm font-bold text-slate-800">
              {isSupabaseConfigured ? 'Live Connection Active' : 'Placeholder Ready'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              13 Tables & RLS Policies Defined
            </p>
          </div>
        </div>
      </div>

      {/* Role Modules Preview Grid */}
      <div className="mt-12">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">User Role Portals</h2>
            <p className="text-sm text-slate-500">
              Role-Based Access Control configured with PostgreSQL Row Level Security
            </p>
          </div>
          <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            3 User Roles
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {/* Admin Portal Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 transition-colors">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">1. Admin Portal</h3>
            <p className="mt-2 text-sm text-slate-600">
              Academic structure control, department & class management, faculty assignments, and immutable audit logs.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-blue-600">
              <span>Configured in Phase 4</span>
              <ArrowRight className="h-3 w-3" />
            </div>
          </div>

          {/* Faculty Portal Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 transition-colors">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <Camera className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">2. Faculty Portal</h3>
            <p className="mt-2 text-sm text-slate-600">
              Live webcam attendance sessions, multi-face real-time detection, review stage, and transactional finalization.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-indigo-600">
              <span>Configured in Phase 6-7</span>
              <ArrowRight className="h-3 w-3" />
            </div>
          </div>

          {/* Student Portal Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 transition-colors">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <GraduationCap className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">3. Student Portal</h3>
            <p className="mt-2 text-sm text-slate-600">
              Biometric consent governance, personal attendance history, analytics trends, and grievance requests.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-sky-600">
              <span>Configured in Phase 5-7</span>
              <ArrowRight className="h-3 w-3" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { UserX, LogOut, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const ProfileErrorPage: React.FC = () => {
  const { user, profileError, signOut, refreshProfile, isProfileLoading } = useAuth();

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-600 shadow-sm">
        <UserX className="h-8 w-8" />
      </div>
      <span className="mt-4 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
        Profile Resolution Error
      </span>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
        Academic Profile Not Found
      </h1>
      
      <div className="mt-4 max-w-xl rounded-2xl border border-red-200 bg-red-50/70 p-5 text-left text-xs text-red-800">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-red-900">Database Role Unresolved</p>
            <p className="text-red-700 leading-relaxed">
              {profileError ||
                `Authenticated user ID (${user?.id}) has no matching record in the "profiles" table. AttendX requires explicit role provisioning (admin, faculty, or student) in PostgreSQL before dashboard access can be granted.`}
            </p>
            <p className="pt-2 text-slate-600 font-mono text-[11px]">
              Email: {user?.email || 'N/A'}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <button
          onClick={() => refreshProfile()}
          disabled={isProfileLoading}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${isProfileLoading ? 'animate-spin' : ''}`} />
          <span>Retry Profile Resolution</span>
        </button>
        <button
          onClick={() => signOut()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
        >
          <LogOut className="h-4 w-4 text-slate-500" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
};

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShieldX, ArrowRight, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const UnauthorizedPage: React.FC = () => {
  const { role, signOut, user } = useAuth();
  const location = useLocation();
  const attemptedPath = (location.state as { attemptedPath?: string })?.attemptedPath || 'the requested resource';

  const getDashboardPath = () => {
    switch (role) {
      case 'admin':
        return '/admin';
      case 'faculty':
        return '/faculty';
      case 'student':
        return '/student';
      default:
        return '/';
    }
  };

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shadow-sm">
        <ShieldX className="h-8 w-8" />
      </div>
      <span className="mt-4 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
        403 Forbidden — Access Restricted
      </span>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
        Unauthorized Route Access
      </h1>
      <p className="mt-2 max-w-lg text-sm text-slate-600 leading-relaxed">
        Your account (<span className="font-semibold text-slate-800">{user?.email}</span>) with role{' '}
        <span className="font-semibold text-blue-600 uppercase">[{role}]</span> does not have authorization
        to access <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800 font-mono text-xs">{attemptedPath}</code>.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <Link
          to={getDashboardPath()}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <span>Return to My Dashboard</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
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

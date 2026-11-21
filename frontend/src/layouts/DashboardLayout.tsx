import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { ScanFace, LogOut, UserCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';

interface DashboardLayoutProps {
  title: string;
  subtitle: string;
  roleBadge: UserRole;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  title,
  subtitle,
  roleBadge,
}) => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const getRoleBadgeClasses = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-50 text-purple-700 ring-purple-700/20';
      case 'faculty':
        return 'bg-indigo-50 text-indigo-700 ring-indigo-700/20';
      case 'student':
        return 'bg-blue-50 text-blue-700 ring-blue-700/20';
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Top Application Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <ScanFace className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-slate-900">
                  Attend<span className="text-blue-600">X</span>
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${getRoleBadgeClasses(
                    roleBadge
                  )}`}
                >
                  {roleBadge}
                </span>
              </div>
              <p className="text-xs text-slate-500">Smart Attendance System</p>
            </div>
          </div>

          {/* User Profile Summary & Logout */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 border-r border-slate-200 pr-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                <UserCircle className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-slate-900">
                  {profile?.full_name || user?.email?.split('@')[0] || 'Authenticated User'}
                </p>
                <p className="text-[11px] text-slate-500">{user?.email}</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-red-600 transition-colors"
              title="Sign out of AttendX"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Header Title Section */}
          <div className="mb-8">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              {title}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>

          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p>AttendX Academic Suite • Role-Enforced via Supabase Row Level Security</p>
        </div>
      </footer>
    </div>
  );
};

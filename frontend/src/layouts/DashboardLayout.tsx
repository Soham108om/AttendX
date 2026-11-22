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

  const roleLabel: Record<UserRole, string> = {
    admin: 'Admin',
    faculty: 'Faculty',
    student: 'Student',
  };

  return (
    <div className="attendx-dashboard flex min-h-screen flex-col text-[#292929]">
      {/* Top Application Bar */}
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between rounded-[22px] border border-[#E8E0D2] bg-[#FFFDF8]/95 px-4 py-3 shadow-[0_12px_32px_rgba(64,53,31,0.08)] backdrop-blur-xl sm:px-5">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E8E0D2] bg-[#FFFDF8] text-[#292929]">
              <ScanFace className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-[-0.03em] text-[#292929]">
              Attend<span className="text-[#C18B24]">X</span>
            </span>
          </div>

          <div className="hidden items-center rounded-full border border-[#EEE6D5] bg-[#F8F5ED] p-1 md:flex">
            <span className="rounded-full bg-[#292929] px-4 py-2 text-xs font-semibold text-white shadow-sm">
              Dashboard
            </span>
          </div>

          {/* User Profile Summary & Logout */}
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-3 sm:flex">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E8E0D2] bg-[#F2EEE4] text-[#77736B]">
                <UserCircle className="h-4.5 w-4.5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-[#292929]">
                  {profile?.full_name || user?.email?.split('@')[0] || 'Authenticated User'}
                </p>
                <p className="text-[10px] text-[#77736B]">{roleLabel[roleBadge]} account</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#E8E0D2] bg-[#FFFDF8] px-3 text-xs font-semibold text-[#292929] transition-colors hover:bg-[#F2EEE4]"
              title="Sign out of AttendX"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1">
        <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-8">
          {/* Header Title Section */}
          <div className="mb-6">
            <h1 className="text-[clamp(1.75rem,4vw,3rem)] font-semibold tracking-[-0.045em] text-[#292929]">
              {title}
            </h1>
            <p className="mt-1 text-sm text-[#77736B]">{subtitle}</p>
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

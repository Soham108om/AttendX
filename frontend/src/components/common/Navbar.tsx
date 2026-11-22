import React from 'react';
import { Link } from 'react-router-dom';
import { ScanFace, LogIn, LayoutDashboard, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const Navbar: React.FC = () => {
  const { user, role, signOut } = useAuth();

  const getDashboardLink = () => {
    switch (role) {
      case 'admin':
        return '/admin';
      case 'faculty':
        return '/faculty';
      case 'student':
        return '/student';
      default:
        return '/login';
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[rgba(50,45,35,0.08)] bg-[#FFF9EA]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8E6B0] text-[#202020] shadow-sm transition-transform group-hover:scale-105">
            <ScanFace className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-[#202020]">
                Attend<span className="text-[#D49514]">X</span>
              </span>
              <span className="rounded-full bg-[#F8E6B0] px-2 py-0.5 text-[10px] font-bold text-[#775A12] border border-[#F5C542]/40">
                PS 18
              </span>
            </div>
            <p className="text-[11px] text-[#77736B]">Smart Academic Attendance</p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              <Link
                to={getDashboardLink()}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#292929] px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-black transition-colors"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                <span>Dashboard ({role || 'User'})</span>
              </Link>
              <button
                onClick={() => signOut()}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(50,45,35,0.12)] bg-white/70 px-3 py-1.5 text-xs font-semibold text-[#77736B] hover:text-red-600 hover:bg-white transition-colors"
                title="Sign Out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#292929] px-4 sm:px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-black transition-all hover:scale-[1.02]"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};

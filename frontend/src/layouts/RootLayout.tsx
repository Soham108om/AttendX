import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from '../components/common/Navbar';

export const RootLayout: React.FC = () => {
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  // Landing page renders its own integrated floating navbar, ambient canvas and footer
  if (isHomePage) {
    return (
      <div className="min-h-screen bg-[#FAF7EF] text-[#202020] antialiased selection:bg-[#F8E6B0] selection:text-[#202020]">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF7EF] text-[#202020] antialiased">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-[rgba(50,45,35,0.08)] bg-[#FFF9EA] py-6 text-center text-xs text-[#77736B]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p>
            AttendX — Smart Attendance via Face Recognition (PS 18) • Built with React, Vite,
            Tailwind CSS & FastAPI
          </p>
        </div>
      </footer>
    </div>
  );
};

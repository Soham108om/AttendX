import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from '../components/common/Navbar';

export const RootLayout: React.FC = () => {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
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

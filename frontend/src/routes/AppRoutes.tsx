import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RootLayout } from '../layouts/RootLayout';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { LandingPage } from '../pages/LandingPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { UnauthorizedPage } from '../pages/auth/UnauthorizedPage';
import { ProfileErrorPage } from '../pages/auth/ProfileErrorPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { AdminDashboard } from '../pages/admin/AdminDashboard';
import { FacultyDashboard } from '../pages/faculty/FacultyDashboard';
import { StudentDashboard } from '../pages/student/StudentDashboard';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicOnlyRoute } from './PublicOnlyRoute';

export const AppRoutes: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes with Base Layout */}
        <Route path="/" element={<RootLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="unauthorized" element={<UnauthorizedPage />} />
          <Route path="profile-error" element={<ProfileErrorPage />} />
          <Route path="404" element={<NotFoundPage />} />
        </Route>

        {/* Public-Only Auth Route (Redirects authenticated users to their dashboard) */}
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        {/* Protected Admin Routes */}
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
          <Route
            path="/admin"
            element={
              <DashboardLayout
                title="Academic Administration"
                subtitle="Centralized Academic Structure & Audit Log Oversight"
                roleBadge="admin"
              />
            }
          >
            <Route index element={<AdminDashboard />} />
          </Route>
        </Route>

        {/* Protected Faculty Routes */}
        <Route element={<ProtectedRoute allowedRoles={['faculty']} />}>
          <Route
            path="/faculty"
            element={
              <DashboardLayout
                title="Faculty Attendance Suite"
                subtitle="Real-Time Webcam Recognition & Two-Stage Finalization"
                roleBadge="faculty"
              />
            }
          >
            <Route index element={<FacultyDashboard />} />
          </Route>
        </Route>

        {/* Protected Student Routes */}
        <Route element={<ProtectedRoute allowedRoles={['student']} />}>
          <Route
            path="/student"
            element={
              <DashboardLayout
                title="Student Academic Portal"
                subtitle="Verified Attendance Records & Biometric Governance"
                roleBadge="student"
              />
            }
          >
            <Route index element={<StudentDashboard />} />
          </Route>
        </Route>

        {/* Catch-all redirect to 404 */}
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

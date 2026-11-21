import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { user, role, isLoading, isProfileLoading, profileError } = useAuth();
  const location = useLocation();

  if (isLoading || isProfileLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <LoadingSpinner
          size="lg"
          message="Verifying identity and role authorization..."
        />
      </div>
    );
  }

  // 1. Unauthenticated users redirected to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 2. Authenticated user but missing or corrupted profile
  if (profileError || !role) {
    return <Navigate to="/profile-error" replace />;
  }

  // 3. Authenticated user trying to access a route outside their permitted role
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" state={{ attemptedPath: location.pathname }} replace />;
  }

  return <Outlet />;
};

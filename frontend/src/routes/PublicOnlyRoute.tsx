import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

export const PublicOnlyRoute: React.FC = () => {
  const { user, role, isLoading, isProfileLoading, profileError } = useAuth();

  if (isLoading || isProfileLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <LoadingSpinner size="lg" message="Checking authentication state..." />
      </div>
    );
  }

  if (user) {
    if (profileError || !role) {
      return <Navigate to="/profile-error" replace />;
    }

    // Redirect authenticated users to their corresponding dashboard
    switch (role) {
      case 'admin':
        return <Navigate to="/admin" replace />;
      case 'faculty':
        return <Navigate to="/faculty" replace />;
      case 'student':
        return <Navigate to="/student" replace />;
      default:
        return <Navigate to="/" replace />;
    }
  }

  return <Outlet />;
};

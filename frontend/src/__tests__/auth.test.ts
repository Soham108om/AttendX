import { describe, it, expect } from 'vitest';
import type { UserRole } from '../types';

const VALID_ROLES: UserRole[] = ['admin', 'faculty', 'student'];

// Role validation helper logic matching AuthContext
function validateDatabaseRole(rawRole: string | null | undefined): {
  role: UserRole | null;
  error: string | null;
} {
  if (!rawRole) {
    return {
      role: null,
      error: 'Profile record contains no role. Role must be explicitly assigned.',
    };
  }

  if (!VALID_ROLES.includes(rawRole as UserRole)) {
    return {
      role: null,
      error: `Invalid system role "${rawRole}". Permitted roles are: admin, faculty, student.`,
    };
  }

  return {
    role: rawRole as UserRole,
    error: null,
  };
}

// Route permission helper logic matching ProtectedRoute
function isAuthorizedForRoute(userRole: UserRole | null, allowedRoles?: UserRole[]): boolean {
  if (!userRole) return false;
  if (!allowedRoles || allowedRoles.length === 0) return true;
  return allowedRoles.includes(userRole);
}

// Redirect resolution matching PublicOnlyRoute & Dashboard navigation
function getRoleDashboardPath(role: UserRole | null): string {
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
}

describe('AttendX Authentication & Role Resolution Tests', () => {
  describe('Role Validation from Database Profiles', () => {
    it('accepts valid admin role', () => {
      const result = validateDatabaseRole('admin');
      expect(result.role).toBe('admin');
      expect(result.error).toBeNull();
    });

    it('accepts valid faculty role', () => {
      const result = validateDatabaseRole('faculty');
      expect(result.role).toBe('faculty');
      expect(result.error).toBeNull();
    });

    it('accepts valid student role', () => {
      const result = validateDatabaseRole('student');
      expect(result.role).toBe('student');
      expect(result.error).toBeNull();
    });

    it('rejects invalid or unauthorized roles without defaulting', () => {
      const invalidRoles = ['superadmin', 'guest', 'moderator', 'unknown', ''];
      for (const raw of invalidRoles) {
        const result = validateDatabaseRole(raw);
        expect(result.role).toBeNull();
        expect(result.error).toBeTruthy();
        expect(result.role).not.toBe('student'); // Must NEVER silently default to student
        expect(result.role).not.toBe('admin');   // Must NEVER silently default to admin
      }
    });

    it('rejects null or undefined role without defaulting', () => {
      const nullResult = validateDatabaseRole(null);
      expect(nullResult.role).toBeNull();
      expect(nullResult.error).toContain('no role');

      const undefinedResult = validateDatabaseRole(undefined);
      expect(undefinedResult.role).toBeNull();
      expect(undefinedResult.error).toContain('no role');
    });
  });

  describe('Role-Based Route Protection Logic', () => {
    it('allows Admin access exclusively to Admin routes', () => {
      expect(isAuthorizedForRoute('admin', ['admin'])).toBe(true);
      expect(isAuthorizedForRoute('admin', ['faculty'])).toBe(false);
      expect(isAuthorizedForRoute('admin', ['student'])).toBe(false);
    });

    it('allows Faculty access exclusively to Faculty routes', () => {
      expect(isAuthorizedForRoute('faculty', ['faculty'])).toBe(true);
      expect(isAuthorizedForRoute('faculty', ['admin'])).toBe(false);
      expect(isAuthorizedForRoute('faculty', ['student'])).toBe(false);
    });

    it('allows Student access exclusively to Student routes', () => {
      expect(isAuthorizedForRoute('student', ['student'])).toBe(true);
      expect(isAuthorizedForRoute('student', ['admin'])).toBe(false);
      expect(isAuthorizedForRoute('student', ['faculty'])).toBe(false);
    });

    it('blocks unauthenticated or unresolved roles from all protected routes', () => {
      expect(isAuthorizedForRoute(null, ['admin'])).toBe(false);
      expect(isAuthorizedForRoute(null, ['faculty'])).toBe(false);
      expect(isAuthorizedForRoute(null, ['student'])).toBe(false);
    });
  });

  describe('Post-Authentication Role Redirects', () => {
    it('resolves correct dashboard URL for each role', () => {
      expect(getRoleDashboardPath('admin')).toBe('/admin');
      expect(getRoleDashboardPath('faculty')).toBe('/faculty');
      expect(getRoleDashboardPath('student')).toBe('/student');
      expect(getRoleDashboardPath(null)).toBe('/login');
    });
  });
});

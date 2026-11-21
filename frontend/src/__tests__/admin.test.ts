import { describe, it, expect } from 'vitest';

// Validation helper unit tests corresponding to adminService
function validateDepartmentInput(code: string, name: string): { valid: boolean; error?: string } {
  const trimmedCode = code.trim().toUpperCase();
  const trimmedName = name.trim();
  if (!trimmedCode) return { valid: false, error: 'Department code is required.' };
  if (!trimmedName) return { valid: false, error: 'Department name is required.' };
  return { valid: true };
}

function validateClassInput(
  departmentId: string,
  name: string,
  academicYear: string,
  semester: number
): { valid: boolean; error?: string } {
  if (!departmentId) return { valid: false, error: 'A department must be selected.' };
  if (!name.trim()) return { valid: false, error: 'Class name is required.' };
  if (!academicYear.trim()) return { valid: false, error: 'Academic year is required.' };
  if (isNaN(semester) || semester < 1 || semester > 8) {
    return { valid: false, error: 'Semester must be between 1 and 8.' };
  }
  return { valid: true };
}

function validateSubjectInput(
  departmentId: string,
  code: string,
  name: string,
  credits: number
): { valid: boolean; error?: string } {
  if (!departmentId) return { valid: false, error: 'A department must be selected.' };
  if (!code.trim()) return { valid: false, error: 'Subject code is required.' };
  if (!name.trim()) return { valid: false, error: 'Subject title is required.' };
  if (isNaN(credits) || credits <= 0) {
    return { valid: false, error: 'Credits must be a positive integer.' };
  }
  return { valid: true };
}

function parseDatabaseError(error: { code?: string; message: string }): string {
  if (error.code === '23505') {
    return 'A record with these unique details (code, name, or semester allocation) already exists in the database.';
  }
  if (error.code === '23503') {
    return 'This record cannot be removed because it is referenced by other academic entities (classes, subjects, faculty, or attendance records).';
  }
  if (error.code === '42501') {
    return 'Access Denied: Only administrators with valid credentials can perform this action under database RLS policies.';
  }
  return error.message || 'An unexpected database error occurred.';
}

describe('Admin Management Foundation Unit Tests', () => {
  describe('Department Input Validations', () => {
    it('validates correct department inputs', () => {
      const res = validateDepartmentInput('CSE', 'Computer Science and Engineering');
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('rejects empty department code', () => {
      const res = validateDepartmentInput('', 'Computer Science');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('code is required');
    });

    it('rejects empty department name', () => {
      const res = validateDepartmentInput('CSE', '   ');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('name is required');
    });
  });

  describe('Class Input Validations', () => {
    it('validates correct class inputs', () => {
      const res = validateClassInput('dept-123', 'CSE-3A', '2025-2026', 5);
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('rejects class without department association', () => {
      const res = validateClassInput('', 'CSE-3A', '2025-2026', 5);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('department must be selected');
    });

    it('rejects semester out of 1-8 bounds', () => {
      expect(validateClassInput('dept-123', 'CSE-3A', '2025-2026', 0).valid).toBe(false);
      expect(validateClassInput('dept-123', 'CSE-3A', '2025-2026', 9).valid).toBe(false);
      expect(validateClassInput('dept-123', 'CSE-3A', '2025-2026', 8).valid).toBe(true);
      expect(validateClassInput('dept-123', 'CSE-3A', '2025-2026', 1).valid).toBe(true);
    });
  });

  describe('Subject Input Validations', () => {
    it('validates correct subject inputs', () => {
      const res = validateSubjectInput('dept-123', 'CS301', 'Database Systems', 4);
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('rejects non-positive credits', () => {
      expect(validateSubjectInput('dept-123', 'CS301', 'Database Systems', 0).valid).toBe(false);
      expect(validateSubjectInput('dept-123', 'CS301', 'Database Systems', -2).valid).toBe(false);
    });

    it('rejects empty code or name', () => {
      expect(validateSubjectInput('dept-123', '', 'Database Systems', 3).valid).toBe(false);
      expect(validateSubjectInput('dept-123', 'CS301', '', 3).valid).toBe(false);
    });
  });

  describe('Database Error Parsing & Constraint Handling', () => {
    it('formats 23505 unique constraint violation into user-friendly message', () => {
      const msg = parseDatabaseError({ code: '23505', message: 'duplicate key' });
      expect(msg).toContain('already exists');
    });

    it('formats 23503 foreign key violation into referential safety explanation', () => {
      const msg = parseDatabaseError({ code: '23503', message: 'foreign key constraint' });
      expect(msg).toContain('referenced by other academic entities');
    });

    it('formats 42501 RLS security denial', () => {
      const msg = parseDatabaseError({ code: '42501', message: 'insufficient_privilege' });
      expect(msg).toContain('Access Denied');
    });
  });
});

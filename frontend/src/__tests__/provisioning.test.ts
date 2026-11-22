import { describe, it, expect } from 'vitest';

// Unit tests for provisioning and assignment validations
function validateFacultyInput(data: {
  email: string;
  full_name: string;
  faculty_id_number: string;
  department_id: string;
  designation: string;
  initial_password?: string;
}): { valid: boolean; error?: string } {
  if (!data.email || !data.email.includes('@')) {
    return { valid: false, error: 'A valid email address is required.' };
  }
  if (!data.full_name.trim()) {
    return { valid: false, error: 'Full name is required.' };
  }
  if (!data.faculty_id_number.trim()) {
    return { valid: false, error: 'Faculty ID number is required.' };
  }
  if (!data.department_id.trim()) {
    return { valid: false, error: 'An academic department must be selected.' };
  }
  if (!data.designation.trim()) {
    return { valid: false, error: 'Designation is required.' };
  }
  if (data.initial_password && data.initial_password.length < 8) {
    return { valid: false, error: 'Initial password must be at least 8 characters if provided.' };
  }
  return { valid: true };
}

function validateStudentInput(data: {
  email: string;
  full_name: string;
  registration_number: string;
  roll_number: string;
  class_id: string;
  initial_password?: string;
}): { valid: boolean; error?: string } {
  if (!data.email || !data.email.includes('@')) {
    return { valid: false, error: 'A valid email address is required.' };
  }
  if (!data.full_name.trim()) {
    return { valid: false, error: 'Full name is required.' };
  }
  if (!data.roll_number.trim()) {
    return { valid: false, error: 'Roll number is required.' };
  }
  if (!data.registration_number.trim()) {
    return { valid: false, error: 'Registration number is required.' };
  }
  if (!data.class_id.trim()) {
    return { valid: false, error: 'A class cohort must be selected.' };
  }
  if (data.initial_password && data.initial_password.length < 8) {
    return { valid: false, error: 'Initial password must be at least 8 characters if provided.' };
  }
  return { valid: true };
}

function validateAssignmentInput(data: {
  faculty_id: string;
  subject_id: string;
  class_id: string;
}): { valid: boolean; error?: string } {
  if (!data.faculty_id.trim()) {
    return { valid: false, error: 'A faculty member must be selected.' };
  }
  if (!data.subject_id.trim()) {
    return { valid: false, error: 'A subject must be selected.' };
  }
  if (!data.class_id.trim()) {
    return { valid: false, error: 'A class must be selected.' };
  }
  return { valid: true };
}

function isDuplicateAssignment(
  existing: Array<{ faculty_id: string; subject_id: string; class_id: string }>,
  candidate: { faculty_id: string; subject_id: string; class_id: string }
): boolean {
  return existing.some(
    (a) =>
      a.faculty_id === candidate.faculty_id &&
      a.subject_id === candidate.subject_id &&
      a.class_id === candidate.class_id
  );
}

describe('Faculty and Student Provisioning Unit Tests', () => {
  describe('Faculty Input Validations', () => {
    it('approves valid faculty payload', () => {
      const res = validateFacultyInput({
        email: 'prof.smith@college.edu',
        full_name: 'Dr. John Smith',
        faculty_id_number: 'FAC-CS-001',
        department_id: 'dept-uuid-1',
        designation: 'Associate Professor',
      });
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('rejects invalid email', () => {
      const res = validateFacultyInput({
        email: 'invalid-email',
        full_name: 'Dr. John Smith',
        faculty_id_number: 'FAC-CS-001',
        department_id: 'dept-uuid-1',
        designation: 'Associate Professor',
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('valid email');
    });

    it('rejects empty department', () => {
      const res = validateFacultyInput({
        email: 'prof.smith@college.edu',
        full_name: 'Dr. John Smith',
        faculty_id_number: 'FAC-CS-001',
        department_id: '',
        designation: 'Associate Professor',
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('department');
    });

    it('rejects short passwords under 8 characters', () => {
      const res = validateFacultyInput({
        email: 'prof.smith@college.edu',
        full_name: 'Dr. John Smith',
        faculty_id_number: 'FAC-CS-001',
        department_id: 'dept-1',
        designation: 'Professor',
        initial_password: 'short',
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('at least 8 characters');
    });
  });

  describe('Student Input Validations', () => {
    it('approves valid student payload', () => {
      const res = validateStudentInput({
        email: 'student@college.edu',
        full_name: 'Sanika Patwardhan',
        registration_number: 'REG-2023-CS-042',
        roll_number: '21CS042',
        class_id: 'class-uuid-1',
      });
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('rejects missing roll number', () => {
      const res = validateStudentInput({
        email: 'student@college.edu',
        full_name: 'Sanika Patwardhan',
        registration_number: 'REG-2023-CS-042',
        roll_number: '',
        class_id: 'class-uuid-1',
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Roll number');
    });

    it('rejects unassigned class cohort', () => {
      const res = validateStudentInput({
        email: 'student@college.edu',
        full_name: 'Sanika Patwardhan',
        registration_number: 'REG-2023-CS-042',
        roll_number: '21CS042',
        class_id: '',
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('class cohort');
    });
  });

  describe('Academic Assignment Validations', () => {
    it('approves complete assignment payload', () => {
      const res = validateAssignmentInput({
        faculty_id: 'fac-1',
        subject_id: 'sub-1',
        class_id: 'cls-1',
      });
      expect(res.valid).toBe(true);
    });

    it('rejects missing fields', () => {
      expect(validateAssignmentInput({ faculty_id: '', subject_id: 'sub-1', class_id: 'cls-1' }).valid).toBe(false);
      expect(validateAssignmentInput({ faculty_id: 'fac-1', subject_id: '', class_id: 'cls-1' }).valid).toBe(false);
      expect(validateAssignmentInput({ faculty_id: 'fac-1', subject_id: 'sub-1', class_id: '' }).valid).toBe(false);
    });

    it('identifies duplicate course assignments', () => {
      const existing = [
        { faculty_id: 'fac-1', subject_id: 'sub-1', class_id: 'cls-1' },
        { faculty_id: 'fac-2', subject_id: 'sub-2', class_id: 'cls-2' },
      ];

      expect(isDuplicateAssignment(existing, { faculty_id: 'fac-1', subject_id: 'sub-1', class_id: 'cls-1' })).toBe(true);
      expect(isDuplicateAssignment(existing, { faculty_id: 'fac-1', subject_id: 'sub-1', class_id: 'cls-2' })).toBe(false);
      expect(isDuplicateAssignment(existing, { faculty_id: 'fac-3', subject_id: 'sub-1', class_id: 'cls-1' })).toBe(false);
    });
  });
});

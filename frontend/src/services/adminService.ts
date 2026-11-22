import { supabase, isSupabaseConfigured } from './supabase';
import type {
  Department,
  CreateDepartmentInput,
  UpdateDepartmentInput,
  AcademicClass,
  CreateClassInput,
  UpdateClassInput,
  Subject,
  CreateSubjectInput,
  UpdateSubjectInput,
  AdminOverviewStats,
  FacultyMember,
  StudentMember,
  AcademicAssignment,
  ProvisionFacultyInput,
  ProvisionStudentInput,
  CreateAssignmentInput,
  ProvisionedCredentialData,
} from '../types';
import { API_BASE_URL } from './apiConfig';

/**
 * Normalizes PostgreSQL errors into user-friendly messages.
 */
function parseDatabaseError(error: { code?: string; message: string; details?: string }): string {
  if (error.code === '23505') {
    return 'A record with these unique details (code, roll number, registration number, or email) already exists in the database.';
  }
  if (error.code === '23503') {
    return 'This record cannot be removed because it is referenced by other academic entities (classes, subjects, faculty, or attendance records).';
  }
  if (error.code === '42501') {
    return 'Access Denied: Only administrators with valid credentials can perform this action under database RLS policies.';
  }
  return error.message || 'An unexpected database error occurred.';
}

/**
 * Retrieves valid Supabase access token for FastAPI backend communication.
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Fetches real-time counts across core academic and user tables.
 */
export async function getAdminOverviewStats(): Promise<{
  data: AdminOverviewStats | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return {
      data: {
        totalStudents: 0,
        totalFaculty: 0,
        totalDepartments: 0,
        totalClasses: 0,
        totalSubjects: 0,
      },
      error: 'Supabase credentials are not configured.',
    };
  }

  try {
    const [studentsRes, facultyRes, deptsRes, classesRes, subjectsRes] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }),
      supabase.from('faculty').select('*', { count: 'exact', head: true }),
      supabase.from('departments').select('*', { count: 'exact', head: true }),
      supabase.from('classes').select('*', { count: 'exact', head: true }),
      supabase.from('subjects').select('*', { count: 'exact', head: true }),
    ]);

    if (studentsRes.error) throw studentsRes.error;
    if (facultyRes.error) throw facultyRes.error;
    if (deptsRes.error) throw deptsRes.error;
    if (classesRes.error) throw classesRes.error;
    if (subjectsRes.error) throw subjectsRes.error;

    return {
      data: {
        totalStudents: studentsRes.count ?? 0,
        totalFaculty: facultyRes.count ?? 0,
        totalDepartments: deptsRes.count ?? 0,
        totalClasses: classesRes.count ?? 0,
        totalSubjects: subjectsRes.count ?? 0,
      },
      error: null,
    };
  } catch (err: unknown) {
    const errorObj = err as { code?: string; message: string };
    return {
      data: null,
      error: parseDatabaseError(errorObj),
    };
  }
}

/* =============================================================================
   DEPARTMENT MANAGEMENT
============================================================================= */

export async function getDepartments(): Promise<{
  data: Department[] | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured) return { data: [], error: 'Supabase not configured.' };

  try {
    const { data, error } = await supabase
      .from('departments')
      .select('id, code, name, created_at')
      .order('code', { ascending: true });

    if (error) throw error;
    return { data: (data as Department[]) ?? [], error: null };
  } catch (err: unknown) {
    return { data: null, error: parseDatabaseError(err as { code?: string; message: string }) };
  }
}

export async function createDepartment(
  input: CreateDepartmentInput
): Promise<{ data: Department | null; error: string | null }> {
  if (!isSupabaseConfigured) return { data: null, error: 'Supabase not configured.' };

  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();

  if (!code || !name) {
    return { data: null, error: 'Department code and name are required.' };
  }

  try {
    const { data, error } = await supabase
      .from('departments')
      .insert([{ code, name }])
      .select()
      .single();

    if (error) throw error;
    return { data: data as Department, error: null };
  } catch (err: unknown) {
    return { data: null, error: parseDatabaseError(err as { code?: string; message: string }) };
  }
}

export async function updateDepartment(
  id: string,
  input: UpdateDepartmentInput
): Promise<{ data: Department | null; error: string | null }> {
  if (!isSupabaseConfigured) return { data: null, error: 'Supabase not configured.' };

  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();

  if (!code || !name) {
    return { data: null, error: 'Department code and name are required.' };
  }

  try {
    const { data, error } = await supabase
      .from('departments')
      .update({ code, name })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data: data as Department, error: null };
  } catch (err: unknown) {
    return { data: null, error: parseDatabaseError(err as { code?: string; message: string }) };
  }
}

export async function deleteDepartment(
  id: string
): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured.' };

  try {
    const [classesCheck, subjectsCheck] = await Promise.all([
      supabase.from('classes').select('id', { count: 'exact', head: true }).eq('department_id', id),
      supabase.from('subjects').select('id', { count: 'exact', head: true }).eq('department_id', id),
    ]);

    if ((classesCheck.count ?? 0) > 0) {
      return {
        success: false,
        error: `Cannot delete department: ${classesCheck.count} active class(es) are associated with it. Delete or reassign those classes first.`,
      };
    }

    if ((subjectsCheck.count ?? 0) > 0) {
      return {
        success: false,
        error: `Cannot delete department: ${subjectsCheck.count} active subject(s) are associated with it. Delete or reassign those subjects first.`,
      };
    }

    const { error } = await supabase.from('departments').delete().eq('id', id);
    if (error) throw error;

    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: parseDatabaseError(err as { code?: string; message: string }) };
  }
}

/* =============================================================================
   CLASS MANAGEMENT
============================================================================= */

export async function getClasses(): Promise<{
  data: AcademicClass[] | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured) return { data: [], error: 'Supabase not configured.' };

  try {
    const { data, error } = await supabase
      .from('classes')
      .select('id, department_id, name, academic_year, semester, created_at, department:departments(id, code, name)')
      .order('name', { ascending: true });

    if (error) throw error;
    return { data: (data as unknown as AcademicClass[]) ?? [], error: null };
  } catch (err: unknown) {
    return { data: null, error: parseDatabaseError(err as { code?: string; message: string }) };
  }
}

export async function createClass(
  input: CreateClassInput
): Promise<{ data: AcademicClass | null; error: string | null }> {
  if (!isSupabaseConfigured) return { data: null, error: 'Supabase not configured.' };

  const name = input.name.trim();
  const academic_year = input.academic_year.trim();
  const semester = Number(input.semester);

  if (!input.department_id) return { data: null, error: 'A department must be selected.' };
  if (!name) return { data: null, error: 'Class name is required.' };
  if (!academic_year) return { data: null, error: 'Academic year is required (e.g. 2025-2026).' };
  if (isNaN(semester) || semester < 1 || semester > 8) {
    return { data: null, error: 'Semester must be a valid number between 1 and 8.' };
  }

  try {
    const { data, error } = await supabase
      .from('classes')
      .insert([
        {
          department_id: input.department_id,
          name,
          academic_year,
          semester,
        },
      ])
      .select('id, department_id, name, academic_year, semester, created_at, department:departments(id, code, name)')
      .single();

    if (error) throw error;
    return { data: (data as unknown as AcademicClass), error: null };
  } catch (err: unknown) {
    return { data: null, error: parseDatabaseError(err as { code?: string; message: string }) };
  }
}

export async function updateClass(
  id: string,
  input: UpdateClassInput
): Promise<{ data: AcademicClass | null; error: string | null }> {
  if (!isSupabaseConfigured) return { data: null, error: 'Supabase not configured.' };

  const name = input.name.trim();
  const academic_year = input.academic_year.trim();
  const semester = Number(input.semester);

  if (!input.department_id) return { data: null, error: 'A department must be selected.' };
  if (!name) return { data: null, error: 'Class name is required.' };
  if (!academic_year) return { data: null, error: 'Academic year is required.' };
  if (isNaN(semester) || semester < 1 || semester > 8) {
    return { data: null, error: 'Semester must be between 1 and 8.' };
  }

  try {
    const { data, error } = await supabase
      .from('classes')
      .update({
        department_id: input.department_id,
        name,
        academic_year,
        semester,
      })
      .eq('id', id)
      .select('id, department_id, name, academic_year, semester, created_at, department:departments(id, code, name)')
      .single();

    if (error) throw error;
    return { data: (data as unknown as AcademicClass), error: null };
  } catch (err: unknown) {
    return { data: null, error: parseDatabaseError(err as { code?: string; message: string }) };
  }
}

export async function deleteClass(
  id: string
): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured.' };

  try {
    const { count: studentCount } = await supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', id);

    if ((studentCount ?? 0) > 0) {
      return {
        success: false,
        error: `Cannot delete class: ${studentCount} student(s) are currently enrolled in this class roster.`,
      };
    }

    const { error } = await supabase.from('classes').delete().eq('id', id);
    if (error) throw error;

    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: parseDatabaseError(err as { code?: string; message: string }) };
  }
}

/* =============================================================================
   SUBJECT MANAGEMENT
============================================================================= */

export async function getSubjects(): Promise<{
  data: Subject[] | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured) return { data: [], error: 'Supabase not configured.' };

  try {
    const { data, error } = await supabase
      .from('subjects')
      .select('id, department_id, code, name, credits, created_at, department:departments(id, code, name)')
      .order('code', { ascending: true });

    if (error) throw error;
    return { data: (data as unknown as Subject[]) ?? [], error: null };
  } catch (err: unknown) {
    return { data: null, error: parseDatabaseError(err as { code?: string; message: string }) };
  }
}

export async function createSubject(
  input: CreateSubjectInput
): Promise<{ data: Subject | null; error: string | null }> {
  if (!isSupabaseConfigured) return { data: null, error: 'Supabase not configured.' };

  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  const credits = Number(input.credits);

  if (!input.department_id) return { data: null, error: 'A department must be selected.' };
  if (!code) return { data: null, error: 'Subject code is required (e.g. CS301).' };
  if (!name) return { data: null, error: 'Subject name is required.' };
  if (isNaN(credits) || credits <= 0) {
    return { data: null, error: 'Credits must be a positive integer (e.g. 3 or 4).' };
  }

  try {
    const { data, error } = await supabase
      .from('subjects')
      .insert([
        {
          department_id: input.department_id,
          code,
          name,
          credits,
        },
      ])
      .select('id, department_id, code, name, credits, created_at, department:departments(id, code, name)')
      .single();

    if (error) throw error;
    return { data: (data as unknown as Subject), error: null };
  } catch (err: unknown) {
    return { data: null, error: parseDatabaseError(err as { code?: string; message: string }) };
  }
}

export async function updateSubject(
  id: string,
  input: UpdateSubjectInput
): Promise<{ data: Subject | null; error: string | null }> {
  if (!isSupabaseConfigured) return { data: null, error: 'Supabase not configured.' };

  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  const credits = Number(input.credits);

  if (!input.department_id) return { data: null, error: 'A department must be selected.' };
  if (!code) return { data: null, error: 'Subject code is required.' };
  if (!name) return { data: null, error: 'Subject name is required.' };
  if (isNaN(credits) || credits <= 0) {
    return { data: null, error: 'Credits must be greater than zero.' };
  }

  try {
    const { data, error } = await supabase
      .from('subjects')
      .update({
        department_id: input.department_id,
        code,
        name,
        credits,
      })
      .eq('id', id)
      .select('id, department_id, code, name, credits, created_at, department:departments(id, code, name)')
      .single();

    if (error) throw error;
    return { data: (data as unknown as Subject), error: null };
  } catch (err: unknown) {
    return { data: null, error: parseDatabaseError(err as { code?: string; message: string }) };
  }
}

export async function deleteSubject(
  id: string
): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured.' };

  try {
    const { count: assignmentCount } = await supabase
      .from('faculty_subject_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('subject_id', id);

    if ((assignmentCount ?? 0) > 0) {
      return {
        success: false,
        error: `Cannot delete subject: ${assignmentCount} faculty assignment(s) are linked to it. Reassign or remove those assignments first.`,
      };
    }

    const { error } = await supabase.from('subjects').delete().eq('id', id);
    if (error) throw error;

    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: parseDatabaseError(err as { code?: string; message: string }) };
  }
}

/* =============================================================================
   FACULTY PROVISIONING & MANAGEMENT (FASTAPI BACKEND + SUPABASE)
============================================================================= */

export async function getFacultyList(): Promise<{
  data: FacultyMember[] | null;
  error: string | null;
}> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/admin/faculty`, { headers });
    const body = await response.json();
    if (!response.ok) {
      return { data: null, error: body.detail || 'Failed to load faculty.' };
    }
    return { data: body as FacultyMember[], error: null };
  } catch (err: unknown) {
    return { data: null, error: parseDatabaseError(err as { code?: string; message: string }) };
  }
}

export async function provisionFaculty(
  input: ProvisionFacultyInput
): Promise<{ data: ProvisionedCredentialData | null; error: string | null }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/admin/provision/faculty`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });

    const body = await res.json();
    if (!res.ok) {
      return { data: null, error: body.detail || 'Failed to provision faculty account.' };
    }

    return {
      data: {
        userId: body.user_id,
        email: body.email,
        fullName: body.full_name,
        role: 'faculty',
        initialPassword: body.initial_password,
        idCode: body.details?.faculty_id_number || input.faculty_id_number,
      },
      error: null,
    };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Backend connection failed during provisioning.',
    };
  }
}

export async function updateFaculty(
  facultyId: string,
  input: { full_name?: string; faculty_id_number?: string; designation?: string; department_id?: string }
): Promise<{ success: boolean; error: string | null }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/admin/faculty/${facultyId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(input),
    });

    const body = await res.json();
    if (!res.ok) {
      return { success: false, error: body.detail || 'Failed to update faculty.' };
    }
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Operation failed.' };
  }
}

export async function deactivateFaculty(
  facultyId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/admin/faculty/${facultyId}/deactivate`, {
      method: 'POST',
      headers,
    });

    const body = await res.json();
    if (!res.ok) {
      return { success: false, error: body.detail || 'Failed to deactivate faculty.' };
    }
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Operation failed.' };
  }
}

/* =============================================================================
   STUDENT PROVISIONING & MANAGEMENT (FASTAPI BACKEND + SUPABASE)
============================================================================= */

export async function getStudentsList(
  classId?: string
): Promise<{ data: StudentMember[] | null; error: string | null }> {
  try {
    const headers = await getAuthHeaders();
    const query = classId ? `?class_id=${encodeURIComponent(classId)}` : '';
    const response = await fetch(`${API_BASE_URL}/admin/students${query}`, { headers });
    const body = await response.json();
    if (!response.ok) {
      return { data: null, error: body.detail || 'Failed to load students.' };
    }
    return { data: body as StudentMember[], error: null };
  } catch (err: unknown) {
    return { data: null, error: parseDatabaseError(err as { code?: string; message: string }) };
  }
}

export async function provisionStudent(
  input: ProvisionStudentInput
): Promise<{ data: ProvisionedCredentialData | null; error: string | null }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/admin/provision/student`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });

    const body = await res.json();
    if (!res.ok) {
      return { data: null, error: body.detail || 'Failed to provision student account.' };
    }

    return {
      data: {
        userId: body.user_id,
        email: body.email,
        fullName: body.full_name,
        role: 'student',
        initialPassword: body.initial_password,
        idCode: body.details?.roll_number || input.roll_number,
      },
      error: null,
    };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Backend connection failed during provisioning.',
    };
  }
}

export async function updateStudent(
  studentId: string,
  input: { full_name?: string; registration_number?: string; roll_number?: string; class_id?: string }
): Promise<{ success: boolean; error: string | null }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/admin/students/${studentId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(input),
    });

    const body = await res.json();
    if (!res.ok) {
      return { success: false, error: body.detail || 'Failed to update student.' };
    }
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Operation failed.' };
  }
}

export async function deactivateStudent(
  studentId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/admin/students/${studentId}/deactivate`, {
      method: 'POST',
      headers,
    });

    const body = await res.json();
    if (!res.ok) {
      return { success: false, error: body.detail || 'Failed to deactivate student.' };
    }
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Operation failed.' };
  }
}

/* =============================================================================
   ACADEMIC ALLOCATIONS / ASSIGNMENTS
============================================================================= */

export async function getAssignmentsList(): Promise<{
  data: AcademicAssignment[] | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured) return { data: [], error: 'Supabase not configured.' };

  try {
    const { data, error } = await supabase
      .from('faculty_subject_assignments')
      .select(
        'id, faculty_id, subject_id, class_id, is_active, created_at, ' +
        'faculty:faculty(faculty_id_number, profile:profiles(full_name)), ' +
        'subject:subjects(code, name), ' +
        'class:classes(name)'
      )
      .order('created_at', { ascending: false });

    if (error) throw error;

    const list: AcademicAssignment[] = (data || []).map((row: any) => ({
      id: row.id,
      faculty_id: row.faculty_id,
      subject_id: row.subject_id,
      class_id: row.class_id,
      is_active: row.is_active ?? true,
      created_at: row.created_at,
      faculty_name: row.faculty?.profile?.full_name,
      faculty_id_number: row.faculty?.faculty_id_number,
      subject_code: row.subject?.code,
      subject_name: row.subject?.name,
      class_name: row.class?.name,
    }));

    return { data: list, error: null };
  } catch (err: unknown) {
    return { data: null, error: parseDatabaseError(err as { code?: string; message: string }) };
  }
}

export async function createAssignment(
  input: CreateAssignmentInput
): Promise<{ success: boolean; error: string | null }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/admin/assignments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });

    const body = await res.json();
    if (!res.ok) {
      return { success: false, error: body.detail || 'Failed to create academic assignment.' };
    }
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Operation failed.' };
  }
}

export async function toggleAssignmentStatus(
  assignmentId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/admin/assignments/${assignmentId}/toggle-active`, {
      method: 'PATCH',
      headers,
    });

    const body = await res.json();
    if (!res.ok) {
      return { success: false, error: body.detail || 'Failed to update assignment.' };
    }
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Operation failed.' };
  }
}

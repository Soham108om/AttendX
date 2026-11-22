export interface FacultyMember {
  id: string;
  email: string;
  full_name: string;
  faculty_id_number: string;
  department_id: string;
  designation: string;
  department_code?: string;
  department_name?: string;
  is_active?: boolean | null;
  account_status?: 'active' | 'inactive' | 'unknown';
  created_at?: string;
}

export interface StudentMember {
  id: string;
  email: string;
  full_name: string;
  registration_number: string;
  roll_number: string;
  class_id: string;
  class_name?: string;
  department_code?: string;
  face_enrolled?: boolean;
  is_active?: boolean | null;
  account_status?: 'active' | 'inactive' | 'unknown';
  created_at?: string;
}

export interface AcademicAssignment {
  id: string;
  faculty_id: string;
  subject_id: string;
  class_id: string;
  is_active: boolean;
  created_at?: string;
  faculty_name?: string;
  faculty_id_number?: string;
  subject_code?: string;
  subject_name?: string;
  class_name?: string;
}

export interface ProvisionFacultyInput {
  email: string;
  full_name: string;
  faculty_id_number: string;
  department_id: string;
  designation: string;
  initial_password?: string;
}

export interface ProvisionStudentInput {
  email: string;
  full_name: string;
  registration_number: string;
  roll_number: string;
  class_id: string;
  initial_password?: string;
}

export interface UpdateFacultyInput {
  full_name?: string;
  faculty_id_number?: string;
  department_id?: string;
  designation?: string;
}

export interface UpdateStudentInput {
  full_name?: string;
  registration_number?: string;
  roll_number?: string;
  class_id?: string;
}

export interface CreateAssignmentInput {
  faculty_id: string;
  subject_id: string;
  class_id: string;
}

export interface ProvisionedCredentialData {
  userId: string;
  email: string;
  fullName: string;
  role: 'faculty' | 'student';
  initialPassword: string;
  idCode: string;
}

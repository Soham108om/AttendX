export type SessionStatus =
  | 'scheduled'
  | 'active_scanning'
  | 'review_pending'
  | 'completed'
  | 'cancelled';

export interface FacultyAssignment {
  id: string;
  faculty_id: string;
  subject_id: string;
  class_id: string;
  is_active: boolean;
  subject_code?: string;
  subject_name?: string;
  department_id?: string;
  department_code?: string;
  department_name?: string;
  class_name?: string;
  academic_year?: string;
  semester?: number;
}

export interface AttendanceSession {
  id: string;
  assignment_id: string;
  created_by: string;
  session_date: string;
  start_time: string;
  end_time?: string | null;
  status: SessionStatus;
  verification_method: string;
  notes?: string | null;
  subject_code?: string;
  subject_name?: string;
  class_name?: string;
  department_code?: string;
  academic_year?: string;
}

export interface SessionFinalizeResult {
  status: 'success';
  session_id: string;
  present_count: number;
  absent_count: number;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  status: 'present' | 'late' | 'absent' | 'excused';
  marked_at: string;
  full_name: string | null;
  roll_number: string | null;
  registration_number: string | null;
}

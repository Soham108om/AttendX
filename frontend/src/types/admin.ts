export interface Department {
  id: string;
  code: string;
  name: string;
  created_at?: string;
}

export interface CreateDepartmentInput {
  code: string;
  name: string;
}

export interface UpdateDepartmentInput {
  code: string;
  name: string;
}

export interface AcademicClass {
  id: string;
  department_id: string;
  name: string;
  academic_year: string;
  semester: number;
  created_at?: string;
  department?: Department | null;
}

export interface CreateClassInput {
  department_id: string;
  name: string;
  academic_year: string;
  semester: number;
}

export interface UpdateClassInput {
  department_id: string;
  name: string;
  academic_year: string;
  semester: number;
}

export interface Subject {
  id: string;
  department_id: string;
  code: string;
  name: string;
  credits: number;
  created_at?: string;
  department?: Department | null;
}

export interface CreateSubjectInput {
  department_id: string;
  code: string;
  name: string;
  credits: number;
}

export interface UpdateSubjectInput {
  department_id: string;
  code: string;
  name: string;
  credits: number;
}

export interface AdminOverviewStats {
  totalStudents: number;
  totalFaculty: number;
  totalDepartments: number;
  totalClasses: number;
  totalSubjects: number;
}

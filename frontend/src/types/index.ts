export type UserRole = 'admin' | 'faculty' | 'student';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface HealthStatus {
  status: string;
  service: string;
}

export interface NavItem {
  label: string;
  href: string;
  icon?: string;
}

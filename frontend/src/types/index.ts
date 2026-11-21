export type UserRole = 'admin' | 'faculty' | 'student';

export interface HealthStatus {
  status: string;
  service: string;
}

export interface NavItem {
  label: string;
  href: string;
  icon?: string;
}

export interface BiometricConsentStatus {
  consent_given: boolean;
  consent_timestamp: string | null;
  revoked_at: string | null;
  active: boolean;
  face_enrolled: boolean;
  has_biometric_records: boolean;
  enrolment_state:
    | 'consent_not_given'
    | 'consent_revoked'
    | 'consent_active_face_not_enrolled'
    | 'face_enrolled'
    | 'review_required'
    | 'blocked_existing_records';
}

export interface ConsentActionResult {
  status: 'consent_recorded';
  active: boolean;
  consent_timestamp: string | null;
  revoked_at: string | null;
}

export interface RevocationResult {
  status: 'consent_revoked' | 'partial_revocation';
  consent_active: boolean;
  embeddings_deleted: boolean;
  face_enrolled: boolean;
  error_code?: 'PARTIAL_REVOCATION';
}

export interface EnrolmentResult {
  status: 'enrolled';
  samples_enrolled: number;
  face_enrolled: boolean;
}

export interface ActiveStudentAttendanceSession {
  id: string;
  session_date: string;
  status: 'active_scanning';
  subject_name: string | null;
  subject_code: string | null;
  class_name: string | null;
  attendance_status: 'present' | 'late' | 'absent' | 'excused' | null;
  marked_at: string | null;
}

export interface StudentAttendanceHistoryRecord {
  session_id: string;
  session_date: string;
  subject_name: string | null;
  subject_code: string | null;
  status: 'present' | 'late' | 'absent' | 'excused';
}

export interface AttendanceVerificationResult {
  status: 'recorded' | 'already_recorded';
  session_id: string;
  attendance_status: 'present' | 'late' | 'absent' | 'excused';
}

export interface BiometricApiError {
  code:
    | 'INVALID_IMAGE_OR_FACE'
    | 'MISSING_OR_REVOKED_CONSENT'
    | 'FACE_ENROLMENT_REQUIRED'
    | 'SESSION_NOT_ACTIVE'
    | 'SESSION_CLASS_MISMATCH'
    | 'FACE_NOT_MATCHED'
    | 'ATTESTATION_REPLAYED'
    | 'EXISTING_ENROLMENT'
    | 'INCOMPLETE_ENROLMENT_CLEANUP'
    | 'PARTIAL_REVOCATION'
    | 'AUTHENTICATION_FAILED'
    | 'UNEXPECTED_BACKEND_ERROR'
    | 'ATTENDANCE_NOT_CONFIGURED'
    | 'FACE_PROCESSING_UNAVAILABLE'
    | 'UNKNOWN';
  message: string;
}

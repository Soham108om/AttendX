import { supabase } from './supabase';
import type {
  BiometricConsentStatus,
  ConsentActionResult,
  RevocationResult,
  EnrolmentResult,
  BiometricApiError,
  ActiveStudentAttendanceSession,
  StudentAttendanceHistoryRecord,
  AttendanceVerificationResult,
} from '../types';
import { API_BASE_URL, resolveApiBaseUrl } from './apiConfig';

/**
 * Resolves and normalizes the backend API base URL from the environment.
 * Kept exported here for compatibility with existing consumers.
 */
export { API_BASE_URL, resolveApiBaseUrl };
export const REQUIRED_FACE_SAMPLE_COUNT = 5;

async function getAuthHeaders(includeJson = true): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${data.session?.access_token || ''}`,
  };
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

export async function readBiometricError(
  response: Response,
  fallback: string,
): Promise<BiometricApiError> {
  try {
    const body = await response.json();
    if (typeof body.detail === 'object' && body.detail?.message) {
      return {
        code: body.detail.code || 'UNKNOWN',
        message: body.detail.message,
      };
    }
    return {
      code: response.status === 401 || response.status === 403 ? 'AUTHENTICATION_FAILED' : 'UNKNOWN',
      message: body.detail || fallback,
    };
  } catch {
    return { code: 'UNEXPECTED_BACKEND_ERROR', message: fallback };
  }
}

export async function getBiometricConsent(): Promise<{
  data: BiometricConsentStatus | null;
  error: BiometricApiError | null;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/student/consent`, {
      headers: await getAuthHeaders(false),
    });
    if (!response.ok) {
      return { data: null, error: await readBiometricError(response, 'Could not load biometric consent status.') };
    }
    return { data: await response.json(), error: null };
  } catch {
    return { data: null, error: { code: 'UNEXPECTED_BACKEND_ERROR', message: 'Could not connect to the biometric consent service.' } };
  }
}

export async function giveBiometricConsent(): Promise<{
  data: ConsentActionResult | null;
  error: BiometricApiError | null;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/student/consent`, {
      method: 'POST',
      headers: await getAuthHeaders(false),
    });
    if (!response.ok) {
      return { data: null, error: await readBiometricError(response, 'Could not record biometric consent.') };
    }
    return { data: await response.json(), error: null };
  } catch {
    return { data: null, error: { code: 'UNEXPECTED_BACKEND_ERROR', message: 'Could not connect to the biometric consent service.' } };
  }
}

export async function revokeBiometricConsent(): Promise<{
  data: RevocationResult | null;
  error: BiometricApiError | null;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/student/consent/revoke`, {
      method: 'POST',
      headers: await getAuthHeaders(false),
    });
    if (!response.ok) {
      return { data: null, error: await readBiometricError(response, 'Could not revoke biometric consent.') };
    }
    return { data: await response.json(), error: null };
  } catch {
    return { data: null, error: { code: 'UNEXPECTED_BACKEND_ERROR', message: 'Could not connect to the biometric consent service.' } };
  }
}

export async function enrolFaceSamples(samples: Blob[]): Promise<{
  data: EnrolmentResult | null;
  error: BiometricApiError | null;
}> {
  if (samples.length !== REQUIRED_FACE_SAMPLE_COUNT) {
    return {
      data: null,
      error: {
        code: 'INVALID_IMAGE_OR_FACE',
        message: `Exactly ${REQUIRED_FACE_SAMPLE_COUNT} face samples are required.`,
      },
    };
  }

  try {
    const form = new FormData();
    samples.forEach((sample, index) => {
      form.append('samples', sample, `face-sample-${index + 1}.jpg`);
    });

    const response = await fetch(`${API_BASE_URL}/student/face-enrolment`, {
      method: 'POST',
      headers: await getAuthHeaders(false),
      body: form,
    });
    if (!response.ok) {
      return { data: null, error: await readBiometricError(response, 'Could not enrol face samples.') };
    }
    return { data: await response.json(), error: null };
  } catch {
    return { data: null, error: { code: 'UNEXPECTED_BACKEND_ERROR', message: 'Could not connect to the face enrolment service.' } };
  }
}

export async function getActiveAttendanceSessions(): Promise<{
  data: ActiveStudentAttendanceSession[] | null;
  error: BiometricApiError | null;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/student/attendance/sessions`, {
      headers: await getAuthHeaders(false),
    });
    if (!response.ok) {
      return { data: null, error: await readBiometricError(response, 'Could not load active attendance sessions.') };
    }
    return { data: await response.json(), error: null };
  } catch {
    return {
      data: null,
      error: { code: 'UNEXPECTED_BACKEND_ERROR', message: 'Could not connect to the attendance service.' },
    };
  }
}

export async function getStudentAttendanceHistory(): Promise<{
  data: StudentAttendanceHistoryRecord[] | null;
  error: BiometricApiError | null;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/student/attendance/history`, {
      headers: await getAuthHeaders(false),
    });
    if (!response.ok) {
      return { data: null, error: await readBiometricError(response, 'Could not load attendance history.') };
    }
    return { data: await response.json(), error: null };
  } catch {
    return {
      data: null,
      error: { code: 'UNEXPECTED_BACKEND_ERROR', message: 'Could not connect to the attendance service.' },
    };
  }
}

export async function verifyAttendanceFrame(
  sessionId: string,
  frame: Blob,
): Promise<{
  data: AttendanceVerificationResult | null;
  error: BiometricApiError | null;
}> {
  if (!frame.size || frame.size > 10 * 1024 * 1024) {
    return {
      data: null,
      error: { code: 'INVALID_IMAGE_OR_FACE', message: 'The captured frame is empty or too large.' },
    };
  }
  try {
    const form = new FormData();
    form.append('frame', frame, 'attendance-frame.jpg');
    const response = await fetch(
      `${API_BASE_URL}/student/attendance/sessions/${encodeURIComponent(sessionId)}/verify`,
      {
        method: 'POST',
        headers: await getAuthHeaders(false),
        body: form,
      },
    );
    if (!response.ok) {
      return { data: null, error: await readBiometricError(response, 'Attendance verification failed.') };
    }
    return { data: await response.json(), error: null };
  } catch {
    return {
      data: null,
      error: { code: 'UNEXPECTED_BACKEND_ERROR', message: 'Could not connect to the attendance service.' },
    };
  }
}

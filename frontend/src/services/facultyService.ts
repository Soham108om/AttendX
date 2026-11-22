import { supabase } from './supabase';
import type { FacultyAssignment, AttendanceRecord, AttendanceSession, SessionFinalizeResult } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

async function getHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.session?.access_token || ''}`,
  };
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return body.detail || fallback;
  } catch {
    return fallback;
  }
}

export async function getFacultyAssignments(): Promise<{
  data: FacultyAssignment[] | null;
  error: string | null;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/faculty/assignments`, {
      headers: await getHeaders(),
    });
    if (!response.ok) {
      return { data: null, error: await readError(response, 'Could not load assigned classes.') };
    }
    return { data: await response.json(), error: null };
  } catch {
    return { data: null, error: 'Could not connect to the faculty service.' };
  }
}

export async function getFacultySessions(sessionDate?: string): Promise<{
  data: AttendanceSession[] | null;
  error: string | null;
}> {
  try {
    const query = sessionDate ? `?session_date=${encodeURIComponent(sessionDate)}` : '';
    const response = await fetch(`${API_BASE_URL}/faculty/sessions${query}`, {
      headers: await getHeaders(),
    });
    if (!response.ok) {
      return { data: null, error: await readError(response, 'Could not load attendance sessions.') };
    }
    return { data: await response.json(), error: null };
  } catch {
    return { data: null, error: 'Could not connect to the faculty service.' };
  }
}

export async function getFacultySession(sessionId: string): Promise<{
  data: AttendanceSession | null;
  error: string | null;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/faculty/sessions/${sessionId}`, {
      headers: await getHeaders(),
    });
    if (!response.ok) {
      return { data: null, error: await readError(response, 'Could not load the attendance session.') };
    }
    return { data: await response.json(), error: null };
  } catch {
    return { data: null, error: 'Could not connect to the faculty service.' };
  }
}

export async function getFacultySessionAttendance(
  sessionId: string,
): Promise<{ data: AttendanceRecord[] | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/faculty/sessions/${sessionId}/attendance`, {
      headers: await getHeaders(),
    });
    if (!response.ok) {
      return { data: null, error: await readError(response, 'Could not load attendance records.') };
    }
    return { data: await response.json(), error: null };
  } catch {
    return { data: null, error: 'Could not connect to the faculty service.' };
  }
}

export async function createFacultySession(input: {
  assignment_id: string;
  session_date?: string;
  notes?: string;
}): Promise<{ data: AttendanceSession | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/faculty/sessions`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      return { data: null, error: await readError(response, 'Could not create the attendance session.') };
    }
    return { data: await response.json(), error: null };
  } catch {
    return { data: null, error: 'Could not connect to the faculty service.' };
  }
}

export async function transitionFacultySession(
  sessionId: string,
  status: 'active_scanning' | 'review_pending' | 'cancelled'
): Promise<{ data: AttendanceSession | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/faculty/sessions/${sessionId}/transition`, {
      method: 'PATCH',
      headers: await getHeaders(),
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      return { data: null, error: await readError(response, 'Could not update the attendance session.') };
    }
    return { data: await response.json(), error: null };
  } catch {
    return { data: null, error: 'Could not connect to the faculty service.' };
  }
}

export async function finalizeFacultySession(
  sessionId: string,
  notes?: string
): Promise<{ data: SessionFinalizeResult | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/faculty/sessions/${sessionId}/finalize`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ notes }),
    });
    if (!response.ok) {
      return { data: null, error: await readError(response, 'Could not finalize the attendance session.') };
    }
    return { data: await response.json(), error: null };
  } catch {
    return { data: null, error: 'Could not connect to the faculty service.' };
  }
}

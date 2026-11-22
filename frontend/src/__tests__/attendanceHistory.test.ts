import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  API_BASE_URL,
  getStudentAttendanceHistory,
} from '../services/studentBiometricService';

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock('../services/supabase', () => ({
  supabase: { auth: { getSession } },
}));

describe('student attendance history service', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('fetches the authenticated student history and preserves persisted fields', async () => {
    const record = {
      session_id: 'session-1',
      session_date: '2026-11-20',
      subject_name: 'Algorithms',
      subject_code: 'CS101',
      status: 'absent' as const,
    };
    getSession.mockResolvedValue({
      data: { session: { access_token: 'student-jwt' } },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [record],
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getStudentAttendanceHistory();

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/student/attendance/history`,
      { headers: { Authorization: 'Bearer student-jwt' } },
    );
    expect(result).toEqual({ data: [record], error: null });
  });

  it('returns an explicit error when the history request fails', async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: 'student-jwt' } },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ detail: 'Attendance history is unavailable.' }),
    }));

    const result = await getStudentAttendanceHistory();

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('Attendance history is unavailable.');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'student-jwt' } },
      })),
    },
  },
}));

import {
  getActiveAttendanceSessions,
  verifyAttendanceFrame,
} from '../services/studentBiometricService';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('student attendance API service', () => {
  it('loads active sessions with the student JWT', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getActiveAttendanceSessions();

    expect(result).toEqual({ data: [], error: null });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/student/attendance/sessions'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer student-jwt' }),
      }),
    );
  });

  it('does not send an empty frame', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifyAttendanceFrame('session-id', new Blob());

    expect(result.error?.code).toBe('INVALID_IMAGE_OR_FACE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a captured frame as multipart without exposing a match result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        status: 'recorded',
        session_id: 'session-id',
        attendance_status: 'present',
      }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifyAttendanceFrame(
      'session/id',
      new Blob(['jpeg-frame'], { type: 'image/jpeg' }),
    );
    const [url, options] = fetchMock.mock.calls[0];
    const body = options.body as FormData;

    expect(String(url)).toContain('/attendance/sessions/session%2Fid/verify');
    expect(options.headers).toEqual({ Authorization: 'Bearer student-jwt' });
    expect(body.get('frame')).toBeInstanceOf(Blob);
    expect(result.data).toEqual({
      status: 'recorded',
      session_id: 'session-id',
      attendance_status: 'present',
    });
  });
});

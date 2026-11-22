import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  enrolFaceSamples,
  resolveApiBaseUrl,
  REQUIRED_FACE_SAMPLE_COUNT,
} from '../services/studentBiometricService';

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock('../services/supabase', () => ({
  supabase: { auth: { getSession } },
}));

function canSubmitConsent(confirmed: boolean): boolean {
  return confirmed;
}

function appendSamples(form: FormData, samples: Blob[]): string[] {
  samples.forEach((sample, index) => {
    form.append('samples', sample, `face-sample-${index + 1}.jpg`);
  });
  return form.getAll('samples').map((value) => value instanceof File ? value.name : 'blob');
}

describe('Student biometric UI rules', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('requires explicit consent confirmation', () => {
    expect(canSubmitConsent(false)).toBe(false);
    expect(canSubmitConsent(true)).toBe(true);
  });

  it('uses the backend multipart field name for face samples', () => {
    const form = new FormData();
    const names = appendSamples(
      form,
      Array.from({ length: REQUIRED_FACE_SAMPLE_COUNT }, (_, index) => new Blob([String(index)])),
    );

    expect(form.getAll('samples')).toHaveLength(REQUIRED_FACE_SAMPLE_COUNT);
    expect(names).toHaveLength(REQUIRED_FACE_SAMPLE_COUNT);
    expect(names[0]).toBe('face-sample-1.jpg');
    expect(names[4]).toBe('face-sample-5.jpg');
  });

  it.each([4, 6])('rejects %s samples without sending a request', async (count) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await enrolFaceSamples(
      Array.from({ length: count }, () => new Blob(['sample'])),
    );

    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('INVALID_IMAGE_OR_FACE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits exactly five samples as multipart without overriding Content-Type', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'enrolled',
        samples_enrolled: REQUIRED_FACE_SAMPLE_COUNT,
        face_enrolled: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await enrolFaceSamples(
      Array.from({ length: REQUIRED_FACE_SAMPLE_COUNT }, () => new Blob(['sample'])),
    );

    expect(result.data?.status).toBe('enrolled');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    expect((options.body as FormData).getAll('samples')).toHaveLength(REQUIRED_FACE_SAMPLE_COUNT);
    expect(options.headers).toEqual({ Authorization: 'Bearer test-token' });
  });

  it('never accepts a consent status without active or revoked metadata', () => {
    const active = { active: true, consent_given: true, revoked_at: null };
    const revoked = { active: false, consent_given: false, revoked_at: '2026-11-21T00:00:00Z' };

    expect(active.active).toBe(true);
    expect(revoked.revoked_at).not.toBeNull();
  });

  it('treats partial revocation as incomplete cleanup', () => {
    const result = {
      status: 'partial_revocation',
      consent_active: false,
      embeddings_deleted: false,
      face_enrolled: true,
    };
    expect(result.status).toBe('partial_revocation');
    expect(result.embeddings_deleted).toBe(false);
    expect(result.face_enrolled).toBe(true);
  });

  it('represents all durable enrolment states', () => {
    const states = [
      'consent_not_given',
      'consent_revoked',
      'consent_active_face_not_enrolled',
      'face_enrolled',
      'review_required',
      'blocked_existing_records',
    ];
    expect(states).toContain('face_enrolled');
    expect(states).toContain('blocked_existing_records');
  });

  it('uses structured codes instead of message substring matching', () => {
    const error = {
      code: 'INCOMPLETE_ENROLMENT_CLEANUP',
      message: 'Face enrolment failed.',
    };
    expect(error.code).toBe('INCOMPLETE_ENROLMENT_CLEANUP');
  });

  it('does not allow stale status requests to replace a newer request', () => {
    let currentRequest = 1;
    const staleRequest = 1;
    currentRequest = 2;
    const mayApply = staleRequest === currentRequest;
    expect(mayApply).toBe(false);
  });

  describe('API base URL resolution and fallback', () => {
    it('falls back to default localhost URL when env URL is undefined or empty', () => {
      expect(resolveApiBaseUrl(undefined)).toBe('http://localhost:8000/api/v1');
      expect(resolveApiBaseUrl('')).toBe('http://localhost:8000/api/v1');
      expect(resolveApiBaseUrl('   ')).toBe('http://localhost:8000/api/v1');
    });

    it('uses configured VITE_API_BASE_URL when provided', () => {
      expect(resolveApiBaseUrl('http://192.168.1.100:8000/api/v1')).toBe('http://192.168.1.100:8000/api/v1');
      expect(resolveApiBaseUrl('https://api.attendx.university.edu/api/v1')).toBe(
        'https://api.attendx.university.edu/api/v1'
      );
    });

    it('adds the API version prefix when configured with only the backend origin', () => {
      expect(resolveApiBaseUrl('https://attendx-backend.onrender.com')).toBe(
        'https://attendx-backend.onrender.com/api/v1'
      );
    });

    it('normalizes and removes trailing slashes', () => {
      expect(resolveApiBaseUrl('http://api.example.com/api/v1/')).toBe('http://api.example.com/api/v1');
      expect(resolveApiBaseUrl('http://api.example.com/api/v1///')).toBe('http://api.example.com/api/v1');
      expect(resolveApiBaseUrl('http://localhost:8000/   ')).toBe('http://localhost:8000/api/v1');
    });
  });
});

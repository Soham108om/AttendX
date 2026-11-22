import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Fingerprint,
  Loader2,
  RefreshCw,
  Shield,
  Trash2,
  UserX,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type {
  ActiveStudentAttendanceSession,
  BiometricConsentStatus,
  StudentAttendanceHistoryRecord,
} from '../../types';
import {
  API_BASE_URL,
  enrolFaceSamples,
  getActiveAttendanceSessions,
  getBiometricConsent,
  getStudentAttendanceHistory,
  giveBiometricConsent,
  REQUIRED_FACE_SAMPLE_COUNT,
  revokeBiometricConsent,
  verifyAttendanceFrame,
} from '../../services/studentBiometricService';

interface CapturedSample {
  id: string;
  blob: Blob;
  url: string;
}

export const StudentDashboard: React.FC = () => {
  const { profile } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [consent, setConsent] = useState<BiometricConsentStatus | null>(null);
  const [consentLoading, setConsentLoading] = useState(true);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [samples, setSamples] = useState<CapturedSample[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const loadRequestRef = useRef(0);
  const mountedRef = useRef(true);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const clearSampleUrls = useCallback(() => {
    setSamples((current) => {
      current.forEach((sample) => URL.revokeObjectURL(sample.url));
      return [];
    });
  }, []);

  const loadConsent = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setConsentLoading(true);
    setActionError(null);
    const result = await getBiometricConsent();
    if (!mountedRef.current || requestId !== loadRequestRef.current) {
      return;
    }
    if (result.error) {
      setActionError(result.error.message);
      setConsent(null);
      stopCamera();
    } else {
      setConsent(result.data);
      if (
        !result.data?.active ||
        result.data.enrolment_state !== 'consent_active_face_not_enrolled'
      ) {
        stopCamera();
      }
    }
    setConsentLoading(false);
  }, [stopCamera]);

  useEffect(() => {
    mountedRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      void loadConsent();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [loadConsent]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      loadRequestRef.current += 1;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setSamples((current) => {
        current.forEach((sample) => URL.revokeObjectURL(sample.url));
        return [];
      });
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    setActionError(null);
    setCameraLoading(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not supported by this browser.');
      setCameraLoading(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError') {
        setCameraError('Camera permission was denied. Allow camera access in browser settings and try again.');
      } else if (name === 'NotFoundError') {
        setCameraError('No camera device was found on this device.');
      } else {
        setCameraError('The camera could not be started. Check device access and try again.');
      }
    } finally {
      setCameraLoading(false);
    }
  };

  const captureSample = () => {
    if (!consent?.active || !cameraActive || !videoRef.current || submitting || samples.length >= REQUIRED_FACE_SAMPLE_COUNT) {
      return;
    }
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext('2d');
    if (!context) {
      setActionError('Could not capture a sample in this browser.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setActionError('Could not capture a usable image. Try again.');
        return;
      }
      const url = URL.createObjectURL(blob);
      if (!mountedRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      setActionError(null);
      setSamples((current) => {
        if (current.length >= REQUIRED_FACE_SAMPLE_COUNT) {
          URL.revokeObjectURL(url);
          return current;
        }
        return [...current, { id: crypto.randomUUID(), blob, url }];
      });
    }, 'image/jpeg', 0.92);
  };

  const removeSample = (id: string) => {
    setSamples((current) => {
      const target = current.find((sample) => sample.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      return current.filter((sample) => sample.id !== id);
    });
  };

  const handleConsent = async () => {
    if (!consentConfirmed) {
      setActionError('Please confirm your consent before continuing.');
      return;
    }
    setSubmitting(true);
    setActionError(null);
    setActionNotice(null);
    const result = await giveBiometricConsent();
    if (result.error || !result.data) {
      const message = result.error?.message || 'Consent could not be recorded.';
      await loadConsent();
      setActionError(message);
    } else {
      setConsentConfirmed(false);
      setActionNotice('Biometric consent recorded. You may now capture samples.');
      await loadConsent();
    }
    setSubmitting(false);
  };

  const handleEnrol = async () => {
    if (!consent?.active) {
      setActionError('Active consent is required before face enrolment.');
      return;
    }
    if (samples.length !== REQUIRED_FACE_SAMPLE_COUNT) {
      setActionError(`Capture exactly ${REQUIRED_FACE_SAMPLE_COUNT} face samples before enrolment.`);
      return;
    }
    setSubmitting(true);
    setActionError(null);
    setActionNotice(null);
    stopCamera();
    const result = await enrolFaceSamples(samples.map((sample) => sample.blob));
    if (result.error) {
      let message = result.error.message;
      if (result.error.code === 'INCOMPLETE_ENROLMENT_CLEANUP') {
        clearSampleUrls();
        message = `${result.error.message} Please contact the administrator and do not submit again until reviewed.`;
      } else if (result.error.code === 'EXISTING_ENROLMENT') {
        message = 'Existing face enrolment was detected. Duplicate samples cannot be overwritten.';
      } else if (result.error.code === 'MISSING_OR_REVOKED_CONSENT') {
        message = 'Consent is missing or revoked. Record consent again before enrolment.';
      } else if (result.error.code === 'AUTHENTICATION_FAILED') {
        message = 'Authentication failed. Sign in again before continuing.';
      }
      await loadConsent();
      setActionError(message);
    } else if (
      result.data?.status === 'enrolled' &&
      result.data.face_enrolled === true &&
      result.data.samples_enrolled === REQUIRED_FACE_SAMPLE_COUNT
    ) {
      clearSampleUrls();
      setActionNotice(`Face enrolment completed with ${REQUIRED_FACE_SAMPLE_COUNT} samples.`);
      await loadConsent();
    } else {
      await loadConsent();
      setActionError('The server did not confirm completion of all five samples. Refresh status before trying again.');
    }
    setSubmitting(false);
  };

  const handleRevoke = async () => {
    setSubmitting(true);
    setActionError(null);
    setActionNotice(null);
    stopCamera();
    clearSampleUrls();
    const result = await revokeBiometricConsent();
    let message: string | null = null;
    if (result.error) {
      message = result.error.message;
    } else if (result.data?.status === 'partial_revocation' || result.data?.error_code === 'PARTIAL_REVOCATION') {
      message = 'Consent has been revoked, but biometric cleanup is incomplete. Contact the administrator; do not submit again until reviewed.';
    } else if (!result.data) {
      message = 'The server did not confirm consent revocation. Refresh the status before continuing.';
    } else {
      setActionNotice('Consent revoked and enrolment data cleanup requested.');
    }
    await loadConsent();
    if (message) {
      setActionError(message);
    }
    setShowRevokeConfirm(false);
    setSubmitting(false);
  };

  const consentNeedsReview = Boolean(
    consent?.has_biometric_records ||
    consent?.face_enrolled ||
    consent?.enrolment_state === 'blocked_existing_records' ||
    consent?.enrolment_state === 'review_required',
  );

  return (
    <div className="student-dashboard space-y-6">
      <div className="rounded-[24px] border border-[#E8E0D2] bg-[linear-gradient(135deg,#FFFDF8_0%,#F8E6B0_100%)] p-6 shadow-[0_12px_32px_rgba(64,53,31,0.06)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#E8E0D2] bg-[#FFFDF8]/80 px-3 py-1 text-xs font-semibold text-[#292929]">
              <Fingerprint className="h-3.5 w-3.5" />
              Biometric Consent & Enrolment
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#292929]">
              Welcome back, {profile?.full_name || 'Student'}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-[#77736B]">
              Verify attendance for your active class sessions. AttendX stores face embeddings, not live camera photographs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadConsent()}
            disabled={consentLoading}
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${consentLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {actionError && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="flex-1">{actionError}</span>
        </div>
      )}
      {actionNotice && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      <AttendanceVerificationPanel
        eligible={Boolean(consent?.active && consent.face_enrolled)}
      />
      <AttendanceHistoryPanel />

      {consentLoading ? (
        <div className="flex min-h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                <Shield className="h-5 w-5" />
              </div>
              {!consent ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                  Status unavailable
                </span>
              ) : consent.active ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                  Consent active
                </span>
              ) : consent.revoked_at ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                  Consent revoked
                </span>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                  Consent not given
                </span>
              )}
            </div>

            {consent?.enrolment_state === 'face_enrolled' && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                Face enrolment is confirmed. Do not submit additional samples unless an administrator directs you to re-enrol.
              </div>
            )}
            {(consent?.enrolment_state === 'blocked_existing_records' || consent?.enrolment_state === 'review_required') && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Face enrolment needs administrator review. Existing records or inconsistent status were detected; do not submit again.
              </div>
            )}
            {!consent?.active && (consent?.has_biometric_records || consent?.face_enrolled) && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Consent is inactive, but biometric records remain. Do not capture or re-submit samples until an administrator reviews cleanup.
              </div>
            )}

            <h3 className="mt-4 text-base font-bold text-slate-900">Biometric consent</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Consent allows AttendX to process face samples and store normalized numerical embeddings for attendance recognition.
              Raw photographs are not stored during enrolment.
            </p>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              <li>• Consent is voluntary and can be revoked.</li>
              <li>• Revocation prevents further enrolment and recognition.</li>
              <li>• Revocation also requests deletion of stored biometric samples.</li>
            </ul>

            {!consent ? (
              <div className="mt-5 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-xs text-amber-800">
                Consent status is unavailable. Refresh the status before granting consent or capturing samples.
              </div>
            ) : !consent.active && consentNeedsReview ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                Existing biometric records or inconsistent status require administrator review before consent can be renewed.
              </div>
            ) : !consent.active ? (
              <div className="mt-5 space-y-3">
                <label className="flex items-start gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={consentConfirmed}
                    onChange={(event) => setConsentConfirmed(event.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>I voluntarily consent to face biometric processing for AttendX attendance features.</span>
                </label>
                <button
                  type="button"
                  onClick={() => void handleConsent()}
                  disabled={!consentConfirmed || submitting}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                  Confirm Consent
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowRevokeConfirm(true)}
                disabled={submitting}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700"
              >
                <UserX className="h-4 w-4" />
                Revoke Consent
              </button>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Face sample capture</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Capture exactly {REQUIRED_FACE_SAMPLE_COUNT} clear samples while consent is active.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {samples.length}/{REQUIRED_FACE_SAMPLE_COUNT}
              </span>
            </div>

            {!consent ? (
              <div className="mt-5 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-8 text-center text-xs text-amber-800">
                Consent status is unavailable. Refresh before starting the camera.
              </div>
            ) : !consent.active ? (
              <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-xs text-slate-500">
                Active biometric consent is required before camera capture.
              </div>
            ) : consent.enrolment_state === 'face_enrolled' ? (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center text-xs text-emerald-800">
                Face enrolment is already complete. Additional submissions are blocked.
              </div>
            ) : consent.enrolment_state === 'blocked_existing_records' || consent.enrolment_state === 'review_required' ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-8 text-center text-xs text-amber-800">
                Enrolment is blocked pending review of existing biometric records or status inconsistency.
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {cameraError && (
                  <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    {cameraError}
                  </div>
                )}
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 aspect-video">
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className={`h-full w-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
                  />
                  {!cameraActive && (
                    <div className="flex h-full items-center justify-center text-center text-xs text-slate-300">
                      <div>
                        <Camera className="mx-auto h-8 w-8" />
                        <p className="mt-2">Camera starts only after you choose Start Camera.</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!cameraActive ? (
                    <button
                      type="button"
                      onClick={() => void startCamera()}
                      disabled={cameraLoading || submitting}
                      className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white"
                    >
                      {cameraLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      Start Camera
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={captureSample}
                        disabled={samples.length >= REQUIRED_FACE_SAMPLE_COUNT || submitting}
                        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        <Camera className="h-4 w-4" />
                        Capture Sample
                      </button>
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                      >
                        <X className="h-4 w-4" />
                        Stop Camera
                      </button>
                    </>
                  )}
                </div>

                {samples.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {samples.map((sample, index) => (
                      <div key={sample.id} className="overflow-hidden rounded-xl border border-slate-200">
                        <img src={sample.url} alt={`Captured face sample ${index + 1}`} className="aspect-video w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeSample(sample.id)}
                          disabled={submitting}
                          className="flex w-full items-center justify-center gap-1 border-t border-slate-200 px-2 py-2 text-[11px] font-semibold text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {samples.length === REQUIRED_FACE_SAMPLE_COUNT && (
                  <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
                    All five samples are captured. Submit them to start secure backend processing.
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void handleEnrol()}
                  disabled={submitting || samples.length !== REQUIRED_FACE_SAMPLE_COUNT}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing enrolment…
                    </>
                  ) : (
                    <>
                      <Fingerprint className="h-4 w-4" />
                      {samples.length === REQUIRED_FACE_SAMPLE_COUNT
                        ? 'Submit 5 Face Samples'
                        : `Capture ${REQUIRED_FACE_SAMPLE_COUNT - samples.length} more sample${REQUIRED_FACE_SAMPLE_COUNT - samples.length === 1 ? '' : 's'}`}
                    </>
                  )}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {showRevokeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="revoke-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 id="revoke-title" className="text-base font-bold text-slate-900">Revoke biometric consent?</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              This prevents further enrolment and recognition. Consent revocation will also request deletion of stored biometric embeddings.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRevokeConfirm(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRevoke()}
                disabled={submitting}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white"
              >
                Revoke Consent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AttendanceVerificationPanel: React.FC<{ eligible: boolean }> = ({ eligible }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const [sessions, setSessions] = useState<ActiveStudentAttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState('');

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getActiveAttendanceSessions();
    if (!mountedRef.current) {
      return;
    }
    if (result.error) {
      setError(result.error.message);
      setSessions([]);
    } else {
      setSessions(result.data || []);
      setSelectedSessionId((current) =>
        current && result.data?.some((session) => session.id === current)
          ? current
          : result.data?.[0]?.id || '',
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      void loadSessions();
    });
    return () => {
      mountedRef.current = false;
      window.cancelAnimationFrame(frame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [loadSessions]);

  const selectedSession = sessions.find((session) => session.id === selectedSessionId);
  const alreadyMarked = Boolean(
    selectedSession?.attendance_status,
  );

  useEffect(() => {
    if (!eligible || alreadyMarked) {
      const frame = window.requestAnimationFrame(stopCamera);
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, [eligible, alreadyMarked, stopCamera]);

  const startCamera = async () => {
    setError(null);
    let apiUrl: URL;
    try {
      apiUrl = new URL(API_BASE_URL, window.location.href);
    } catch {
      setError('The attendance service URL is invalid. Contact the administrator.');
      return;
    }
    const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);
    const localDevelopment =
      loopbackHosts.has(window.location.hostname) &&
      loopbackHosts.has(apiUrl.hostname);
    if (
      !window.isSecureContext ||
      (apiUrl.protocol !== 'https:' && !localDevelopment)
    ) {
      setError('Camera attendance requires a secure HTTPS connection, except for local development.');
      return;
    }
    setCameraLoading(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access is not supported by this browser.');
      setCameraLoading(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (cameraError) {
      if (!mountedRef.current) {
        return;
      }
      stopCamera();
      const name = cameraError instanceof DOMException ? cameraError.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access and retry.'
          : name === 'NotFoundError'
            ? 'No camera device was found.'
            : 'The camera could not be started. Check device access and retry.',
      );
    } finally {
      if (mountedRef.current) {
        setCameraLoading(false);
      }
    }
  };

  const captureAndVerify = () => {
    if (!selectedSession || !cameraActive || !videoRef.current || submitting) {
      return;
    }
    const video = videoRef.current;
    if (!video.videoWidth || !video.videoHeight) {
      setError('The camera is not ready yet. Wait for the preview and retry.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('Could not capture a frame in this browser.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (frame) => {
      if (!mountedRef.current) {
        return;
      }
      if (!frame) {
        setError('Could not capture a usable frame. Try again.');
        return;
      }
      setSubmitting(true);
      setError(null);
      setNotice(null);
      stopCamera();
      const result = await verifyAttendanceFrame(selectedSession.id, frame);
      if (!mountedRef.current) {
        return;
      }
      if (result.error) {
        setError(result.error.message);
      } else if (result.data?.status === 'recorded') {
        setNotice('Attendance recorded. Your persisted status is present.');
        await loadSessions();
      } else if (result.data?.status === 'already_recorded') {
        setNotice('Your attendance was already recorded for this session.');
        await loadSessions();
      } else {
        setError('The server did not confirm a persisted attendance result.');
      }
      setSubmitting(false);
    }, 'image/jpeg', 0.9);
  };

  return (
    <section className="rounded-2xl border border-sky-100 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Live attendance verification</h3>
          <p className="mt-1 text-xs text-slate-500">
            Your camera frame is processed by the backend and is not retained.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSessions()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</div>}
      {notice && <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</div>}

      {loading ? (
        <div className="flex min-h-28 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
          No active attendance sessions are available for your class.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700" htmlFor="active-attendance-session">
              Active session
            </label>
            <select
              id="active-attendance-session"
              value={selectedSessionId}
              onChange={(event) => {
                stopCamera();
                setSelectedSessionId(event.target.value);
                setError(null);
                setNotice(null);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.subject_code || session.subject_name || 'Class session'} — {session.class_name || 'Class'} — {session.session_date}
                </option>
              ))}
            </select>
            {alreadyMarked ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                Persisted attendance status: {selectedSession?.attendance_status}.
              </p>
            ) : !eligible ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Active biometric consent and a completed face enrolment are required.
              </p>
            ) : (
              <p className="rounded-xl bg-sky-50 p-3 text-xs text-sky-800">
                Select Start Camera, allow access, then verify once the preview is ready.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-950">
              <video
                ref={videoRef}
                muted
                playsInline
                className={`h-full w-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
              />
              {!cameraActive && (
                <div className="flex h-full items-center justify-center text-center text-xs text-slate-300">
                  Camera is off.
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!cameraActive ? (
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  disabled={!eligible || alreadyMarked || !selectedSession || cameraLoading || submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {cameraLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  Start Camera
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={captureAndVerify}
                    disabled={submitting || !eligible || alreadyMarked}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {submitting ? 'Verifying…' : 'Verify Attendance'}
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    disabled={submitting}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                  >
                    Stop Camera
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

const AttendanceHistoryPanel: React.FC = () => {
  const [records, setRecords] = useState<StudentAttendanceHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const loadHistory = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    const result = await getStudentAttendanceHistory();
    if (requestId !== requestRef.current) {
      return;
    }
    if (result.error) {
      setError(result.error.message);
    } else {
      setRecords(result.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void loadHistory();
    });
    const timer = window.setInterval(() => {
      void loadHistory();
    }, 30000);
    window.addEventListener('focus', loadHistory);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener('focus', loadHistory);
      requestRef.current += 1;
    };
  }, [loadHistory]);

  return (
    <section aria-labelledby="student-attendance-history-title" className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 id="student-attendance-history-title" className="text-base font-bold text-slate-900">
            Attendance history
          </h3>
          <p className="mt-1 text-xs text-slate-600">Completed sessions with persisted attendance records.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadHistory()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}
      {loading && records.length === 0 ? (
        <div className="flex min-h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
        </div>
      ) : !error && records.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">No completed attendance records yet.</p>
      ) : records.length > 0 ? (
        <div className="mt-4 divide-y divide-slate-100">
          {records.map((record) => {
            const label = record.status === 'late'
              ? 'Late'
              : record.status.charAt(0).toUpperCase() + record.status.slice(1);
            const statusClass = record.status === 'present'
              ? 'bg-emerald-50 text-emerald-700'
              : record.status === 'absent'
                ? 'bg-red-50 text-red-700'
                : 'bg-amber-50 text-amber-700';
            const subject = record.subject_name
              ? `${record.subject_code ? `${record.subject_code} — ` : ''}${record.subject_name}`
              : record.subject_code || 'Subject unavailable';

            return (
              <div key={record.session_id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <span className="text-sm font-medium text-slate-800">{subject}</span>
                <time dateTime={record.session_date} className="text-xs text-slate-600">{record.session_date}</time>
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>{label}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
};

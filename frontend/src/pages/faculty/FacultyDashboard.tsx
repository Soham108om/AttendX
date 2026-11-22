import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  History,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Users,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { AttendanceRecord, AttendanceSession, FacultyAssignment } from '../../types';
import {
  createFacultySession,
  finalizeFacultySession,
  getFacultyAssignments,
  getFacultySessions,
  getFacultySession,
  getFacultySessionAttendance,
  transitionFacultySession,
} from '../../services/facultyService';

function statusLabel(status: AttendanceSession['status']): string {
  switch (status) {
    case 'scheduled':
      return 'Scheduled';
    case 'active_scanning':
      return 'Scanning';
    case 'review_pending':
      return 'Review Pending';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
  }
}

export const FacultyDashboard: React.FC = () => {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState<FacultyAssignment[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(() => new Intl.DateTimeFormat('en-CA').format(new Date()));
  const attendanceRequestRef = useRef(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [assignmentResult, sessionResult] = await Promise.all([
      getFacultyAssignments(),
      getFacultySessions(),
    ]);
    if (assignmentResult.error || sessionResult.error) {
      setError(assignmentResult.error || sessionResult.error);
      setAssignments(assignmentResult.data || []);
      setSessions(sessionResult.data || []);
    } else {
      setAssignments(assignmentResult.data || []);
      setSessions(sessionResult.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadAttendance = useCallback(async (sessionId: string) => {
    const requestId = ++attendanceRequestRef.current;
    setAttendanceLoading(true);
    setAttendanceError(null);
    const result = await getFacultySessionAttendance(sessionId);
    if (requestId !== attendanceRequestRef.current) {
      return;
    }
    if (result.error) {
      setAttendanceError(result.error);
    } else {
      setAttendanceRecords(result.data || []);
    }
    setAttendanceLoading(false);
  }, []);

  const activeSessionId = selectedSession?.id;
  const activeSessionStatus = selectedSession?.status;
  useEffect(() => {
    if (!activeSessionId) {
      attendanceRequestRef.current += 1;
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      void loadAttendance(activeSessionId);
    });
    if (activeSessionStatus !== 'active_scanning' && activeSessionStatus !== 'review_pending') {
      return () => window.cancelAnimationFrame(frame);
    }
    const timer = window.setInterval(() => {
      void loadAttendance(activeSessionId);
    }, 5000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, [activeSessionId, activeSessionStatus, loadAttendance]);

  const todaySessions = sessions.filter((session) => session.session_date === today);
  const historySessions = sessions.filter((session) => session.session_date !== today);

  const startSession = async (assignment: FacultyAssignment) => {
    setActionLoading(true);
    setError(null);
    const result = await createFacultySession({
      assignment_id: assignment.id,
      session_date: today,
    });
    if (result.error || !result.data) {
      setError(result.error || 'Could not create attendance session.');
    } else {
      setSessions((current) => [result.data!, ...current]);
      setSelectedSession(result.data);
    }
    setActionLoading(false);
  };

  const openSession = async (sessionId: string) => {
    setActionLoading(true);
    const result = await getFacultySession(sessionId);
    if (result.error || !result.data) {
      setError(result.error || 'Could not load session details.');
    } else {
      setAttendanceRecords([]);
      setAttendanceError(null);
      setSelectedSession(result.data);
    }
    setActionLoading(false);
  };

  const transition = async (
    session: AttendanceSession,
    target: 'active_scanning' | 'review_pending' | 'cancelled'
  ) => {
    setActionLoading(true);
    setError(null);
    const result = await transitionFacultySession(session.id, target);
    if (result.error || !result.data) {
      setError(result.error || 'Could not update the session.');
    } else {
      setSessions((current) =>
        current.map((item) => (item.id === result.data!.id ? result.data! : item))
      );
      setSelectedSession(result.data);
    }
    setActionLoading(false);
  };

  const finalize = async (session: AttendanceSession) => {
    setActionLoading(true);
    setError(null);
    const result = await finalizeFacultySession(session.id);
    if (result.error) {
      setError(result.error);
    } else {
      await loadData();
      setAttendanceRecords([]);
      setAttendanceError(null);
      setSelectedSession(null);
    }
    setActionLoading(false);
  };

  return (
    <div className="faculty-dashboard space-y-6">
      <div className="rounded-[24px] border border-[#E8E0D2] bg-[linear-gradient(135deg,#FFFDF8_0%,#F8E6B0_100%)] p-6 shadow-[0_12px_32px_rgba(64,53,31,0.06)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#E8E0D2] bg-[#FFFDF8]/80 px-3 py-1 text-xs font-semibold text-[#292929]">
              <Camera className="h-3.5 w-3.5" />
              Faculty Attendance Portal
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#292929]">
              Welcome back, Prof. {profile?.full_name || 'Faculty Member'}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Manage assigned classes and attendance session lifecycle.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Unable to complete the request</p>
              <p className="mt-1">{error}</p>
            </div>
            <button type="button" onClick={() => void loadData()} className="font-semibold underline">
              Retry
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Assigned Classes</h3>
              <span className="text-xs text-slate-500">{assignments.length} active assignment(s)</span>
            </div>
            {assignments.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                <Users className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 font-semibold text-slate-700">No active assignments</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {assignments.map((assignment) => (
                  <div key={assignment.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="text-xs font-bold text-indigo-700">
                      [{assignment.subject_code}] {assignment.subject_name}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{assignment.class_name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {[assignment.department_code, assignment.academic_year ? `${assignment.academic_year}` : null, assignment.semester ? `Semester ${assignment.semester}` : null]
                        .filter(Boolean)
                        .join(' • ') || 'Department details unavailable'}
                    </p>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => void startSession(assignment)}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <Play className="h-4 w-4" />
                      Start Attendance
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-800">Today&apos;s Sessions</h3>
              {todaySessions.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-7 text-center text-xs text-slate-500">
                  No sessions scheduled today.
                </div>
              ) : (
                todaySessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    selected={selectedSession?.id === session.id}
                    onOpen={() => void openSession(session.id)}
                  />
                ))
              )}

              <h3 className="pt-2 text-sm font-bold text-slate-800">Session History</h3>
              {historySessions.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-7 text-center text-xs text-slate-500">
                  No previous sessions.
                </div>
              ) : (
                historySessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    selected={selectedSession?.id === session.id}
                    onOpen={() => void openSession(session.id)}
                  />
                ))
              )}
            </div>

            <SessionDetails
              session={selectedSession}
              actionLoading={actionLoading}
              attendanceRecords={attendanceRecords}
              attendanceLoading={attendanceLoading}
              attendanceError={attendanceError}
              onRefreshAttendance={() => selectedSession && void loadAttendance(selectedSession.id)}
              onTransition={(session, target) => void transition(session, target)}
              onFinalize={(session) => void finalize(session)}
            />
          </section>
        </>
      )}
    </div>
  );
};

const SessionRow: React.FC<{
  session: AttendanceSession;
  selected: boolean;
  onOpen: () => void;
}> = ({ session, selected, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className={`flex w-full items-center justify-between rounded-2xl border bg-white p-4 text-left ${
      selected ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'
    }`}
  >
    <div>
      <p className="text-xs font-bold text-slate-900">
        [{session.subject_code || 'SUBJECT'}] {session.subject_name || 'Subject'}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {session.class_name || 'Class'} • {session.session_date}
      </p>
    </div>
    <StatusBadge status={session.status} />
  </button>
);

const StatusBadge: React.FC<{ status: AttendanceSession['status'] }> = ({ status }) => {
  const styles: Record<AttendanceSession['status'], string> = {
    scheduled: 'bg-sky-50 text-sky-700 border-sky-200',
    active_scanning: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    review_pending: 'bg-amber-50 text-amber-700 border-amber-200',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${styles[status]}`}>
      {statusLabel(status)}
    </span>
  );
};

const SessionDetails: React.FC<{
  session: AttendanceSession | null;
  actionLoading: boolean;
  attendanceRecords: AttendanceRecord[];
  attendanceLoading: boolean;
  attendanceError: string | null;
  onRefreshAttendance: () => void;
  onTransition: (
    session: AttendanceSession,
    target: 'active_scanning' | 'review_pending' | 'cancelled'
  ) => void;
  onFinalize: (session: AttendanceSession) => void;
}> = ({
  session,
  actionLoading,
  attendanceRecords,
  attendanceLoading,
  attendanceError,
  onRefreshAttendance,
  onTransition,
  onFinalize,
}) => (
  <aside className="rounded-2xl border border-slate-200 bg-white p-5">
    {!session ? (
      <div className="flex min-h-64 flex-col items-center justify-center text-center text-xs text-slate-500">
        <History className="h-8 w-8 text-slate-300" />
        <p className="mt-2 font-semibold text-slate-700">Select a session</p>
        <p className="mt-1">View details and lifecycle actions here.</p>
      </div>
    ) : (
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900">{session.subject_name || 'Subject Session'}</p>
            <p className="mt-1 text-xs text-slate-500">{session.class_name || 'Class'}</p>
          </div>
          <StatusBadge status={session.status} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-800">
              Persisted attendance ({attendanceRecords.filter((record) => record.status === 'present' || record.status === 'late').length} present)
            </p>
            <button
              type="button"
              onClick={onRefreshAttendance}
              disabled={attendanceLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
            >
              <RefreshCw className={`h-3 w-3 ${attendanceLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          {attendanceError ? (
            <p role="alert" className="mt-3 text-xs text-red-700">{attendanceError}</p>
          ) : attendanceLoading && attendanceRecords.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">Loading attendance…</p>
          ) : attendanceRecords.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">No persisted attendance records yet.</p>
          ) : (
            <ul className="mt-3 max-h-56 divide-y divide-slate-200 overflow-auto">
              {attendanceRecords.map((record) => (
                <li key={record.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                  <span className="min-w-0 truncate font-medium text-slate-800">
                    {record.full_name || 'Student'}
                    {(record.roll_number || record.registration_number) && (
                      <span className="ml-1 text-slate-500">
                        ({record.roll_number || record.registration_number})
                      </span>
                    )}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                    record.status === 'present' || record.status === 'late'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {record.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {session.status === 'scheduled' && (
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => onTransition(session, 'active_scanning')}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
          >
            <Play className="h-4 w-4" />
            Start Scanning
          </button>
        )}
        {session.status === 'active_scanning' && (
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => onTransition(session, 'review_pending')}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white"
          >
            <Square className="h-4 w-4" />
            Stop Scanning / Review Attendance
          </button>
        )}
        {session.status === 'review_pending' && (
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => onFinalize(session)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
          >
            <CheckCircle2 className="h-4 w-4" />
            Finalize Attendance
          </button>
        )}
        {session.status !== 'completed' && session.status !== 'cancelled' && (
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => onTransition(session, 'cancelled')}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
          >
            <XCircle className="h-4 w-4" />
            Cancel Session
          </button>
        )}
      </div>
    )}
  </aside>
);

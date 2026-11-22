import logging
import re
from typing import Any, Dict, List, Optional
from uuid import UUID
from datetime import date

from fastapi import HTTPException, status
from postgrest.exceptions import APIError

from app.core.supabase import get_supabase_admin_client, get_supabase_user_client
from app.schemas.faculty import (
    FacultyAssignmentResponse,
    AttendanceSessionResponse,
    SessionCreateRequest,
    SessionFinalizeResponse,
)
from app.schemas.student_attendance import FacultyAttendanceRecordResponse

logger = logging.getLogger("uvicorn.error")


class FacultyService:
    @staticmethod
    def _admin():
        admin = get_supabase_admin_client()
        if not admin:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Database service is not configured.")
        return admin

    @classmethod
    def _response_error(cls, response: Any) -> Optional[str]:
        error = getattr(response, "error", None)
        if error:
            return str(getattr(error, "message", error))
        data = getattr(response, "data", None)
        if isinstance(data, dict) and data.get("error"):
            return str(data.get("message") or data["error"])
        return None

    @classmethod
    def _response_error_code(cls, response: Any) -> Optional[str]:
        candidates = (
            getattr(response, "error", None),
            getattr(response, "data", None),
            response,
        )
        for candidate in candidates:
            code = cls._find_error_code(candidate)
            if code:
                return code
        return None

    @classmethod
    def _exception_error_code(cls, exc: Any) -> Optional[str]:
        code = cls._find_error_code(exc)
        if code:
            return code
        message = str(exc)
        if "23505" in message:
            return "23505"
        if "PGRST116" in message:
            return "PGRST116"
        return None

    @staticmethod
    def _log_backend_error(operation: str, error: Any) -> None:
        code = getattr(error, "code", None)
        message = getattr(error, "message", None)
        details = getattr(error, "details", None)
        hint = getattr(error, "hint", None)

        if isinstance(error, dict):
            code = error.get("code", code)
            message = error.get("message", message)
            details = error.get("details", details)
            hint = error.get("hint", hint)
        elif isinstance(error, BaseException) and not isinstance(message, str):
            message = str(error)

        sqlstate = (
            code
            if isinstance(code, str) and re.fullmatch(r"[0-9A-Z]{5}", code)
            else "null"
        )
        constraint_name = "null"
        if isinstance(message, str):
            match = re.search(r'\bconstraint\s+"([^"]+)"', message, re.IGNORECASE)
            if match and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", match.group(1)):
                constraint_name = match.group(1)

        traceback_info = False
        if isinstance(error, BaseException) and error.__traceback__ is not None:
            traceback_info = (type(error), error, error.__traceback__)

        logger.error(
            "operation=%s error_type=%s error_repr=%r sqlstate=%s "
            "constraint=%s api_code=%r api_message=%r api_details=%r api_hint=%r",
            operation,
            type(error).__name__,
            repr(error),
            sqlstate,
            constraint_name,
            code,
            message,
            details,
            hint,
            exc_info=traceback_info,
        )

    @staticmethod
    def _session_insert_error_detail(error: Any) -> str:
        if isinstance(error, APIError):
            parts = [
                f"SQLSTATE {error.code}" if error.code else None,
                error.message,
                f"Details: {error.details}" if error.details else None,
                f"Hint: {error.hint}" if error.hint else None,
            ]
            detail = "; ".join(part for part in parts if part)
            if detail:
                return detail

        if isinstance(error, dict):
            message = error.get("message")
        else:
            message = getattr(error, "message", None)
            if not isinstance(message, str) and isinstance(error, BaseException):
                message = str(error)
        if isinstance(message, str) and message.strip():
            return message
        return "Attendance session could not be created; the database returned no error details."

    @classmethod
    def _find_error_code(cls, value: Any, depth: int = 0) -> Optional[str]:
        if value is None or depth > 6:
            return None

        if isinstance(value, dict):
            for key in ("code", "error_code", "status_code"):
                code = value.get(key)
                if code:
                    return str(code)
            for key in ("error", "details", "response", "context", "cause"):
                code = cls._find_error_code(value.get(key), depth + 1)
                if code:
                    return code
            return None

        for attr in ("code", "error_code", "status_code"):
            code = getattr(value, attr, None)
            if code:
                return str(code)
        for attr in ("error", "details", "response", "context", "cause"):
            nested = getattr(value, attr, None)
            code = cls._find_error_code(nested, depth + 1)
            if code:
                return code

        args = getattr(value, "args", None)
        if isinstance(args, tuple):
            for arg in args:
                code = cls._find_error_code(arg, depth + 1)
                if code:
                    return code
        return None

    @classmethod
    async def get_assignments(cls, faculty_id: UUID) -> List[FacultyAssignmentResponse]:
        admin = cls._admin()
        try:
            response = (
                admin.from_("faculty_subject_assignments")
                .select(
                    "id, faculty_id, subject_id, class_id, is_active, "
                    "subject:subjects(id, code, name, department_id, department:departments(id, code, name)), "
                    "class:classes(id, name, academic_year, semester, department_id)"
                )
                .eq("faculty_id", str(faculty_id))
                .eq("is_active", True)
                .order("created_at", desc=True)
                .execute()
            )
        except Exception as exc:
            cls._log_backend_error("faculty.assignments.list", exc)
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load faculty assignments.") from exc
        if cls._response_error(response):
            cls._log_backend_error(
                "faculty.assignments.list",
                getattr(response, "error", None) or getattr(response, "data", None),
            )
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load faculty assignments.")

        results: List[FacultyAssignmentResponse] = []
        for row in response.data or []:
            subject = row.get("subject") or {}
            department = subject.get("department") or {}
            class_row = row.get("class") or {}
            results.append(FacultyAssignmentResponse(
                id=row["id"],
                faculty_id=row["faculty_id"],
                subject_id=row["subject_id"],
                class_id=row["class_id"],
                is_active=row.get("is_active", True),
                subject_code=subject.get("code"),
                subject_name=subject.get("name"),
                department_id=subject.get("department_id") or class_row.get("department_id"),
                department_code=department.get("code"),
                department_name=department.get("name"),
                class_name=class_row.get("name"),
                academic_year=class_row.get("academic_year"),
                semester=class_row.get("semester"),
            ))
        return results

    @classmethod
    async def create_session(
        cls,
        faculty_id: UUID,
        req: SessionCreateRequest,
    ) -> AttendanceSessionResponse:
        admin = cls._admin()
        try:
            assignment_response = (
                admin.from_("faculty_subject_assignments")
                .select("id, faculty_id, subject_id, class_id, is_active")
                .eq("id", str(req.assignment_id))
                .eq("faculty_id", str(faculty_id))
                .eq("is_active", True)
                .single()
                .execute()
            )
        except Exception as exc:
            if cls._exception_error_code(exc) == "PGRST116":
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found or not assigned to you.") from exc
            cls._log_backend_error("faculty.session.assignment_lookup", exc)
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not verify assignment ownership.") from exc
        if cls._response_error(assignment_response) or not assignment_response.data:
            code = cls._response_error_code(assignment_response)
            if code == "PGRST116":
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found or not assigned to you.")
            cls._log_backend_error(
                "faculty.session.assignment_lookup",
                getattr(assignment_response, "error", None)
                or getattr(assignment_response, "data", None),
            )
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not verify assignment ownership.")

        session_date = req.session_date or date.today()
        try:
            conflicting = (
                admin.from_("attendance_sessions")
                .select("id")
                .eq("assignment_id", str(req.assignment_id))
                .eq("session_date", session_date.isoformat())
                .in_("status", ["scheduled", "active_scanning", "review_pending"])
                .execute()
            )
        except Exception as exc:
            cls._log_backend_error("faculty.session.conflict_check", exc)
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not validate session conflicts.") from exc
        if cls._response_error(conflicting):
            cls._log_backend_error(
                "faculty.session.conflict_check",
                getattr(conflicting, "error", None) or getattr(conflicting, "data", None),
            )
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not validate session conflicts.")
        if conflicting.data:
            raise HTTPException(status.HTTP_409_CONFLICT, "An open attendance session already exists for this assignment and date.")

        payload: Dict[str, Any] = {
            "assignment_id": str(req.assignment_id),
            "created_by": str(faculty_id),
            "session_date": session_date.isoformat(),
            "verification_method": "webcam_face_recognition",
            "status": "scheduled",
        }
        if req.notes:
            payload["notes"] = req.notes
        try:
            response = (
                admin.from_("attendance_sessions")
                .insert([payload])
                .execute()
            )
        except Exception as exc:
            cls._log_backend_error("faculty_attendance_session.insert", exc)
            code = cls._exception_error_code(exc)
            if code == "23505":
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "An open attendance session already exists for this assignment.",
                ) from exc
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                cls._session_insert_error_detail(exc),
            ) from exc
        error = cls._response_error(response)
        if error:
            insert_error = getattr(response, "error", None) or getattr(response, "data", None)
            cls._log_backend_error("faculty_attendance_session.insert", insert_error)
            code = cls._response_error_code(response)
            if code == "23505" or "23505" in error:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "An open attendance session already exists for this assignment.",
                )
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                cls._session_insert_error_detail(insert_error),
            )
        rows = response.data
        if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
            cls._log_backend_error(
                "faculty_attendance_session.insert",
                RuntimeError("The database returned no inserted session row."),
            )
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Attendance session could not be created.")
        return cls._serialize_session(admin, rows[0])

    @classmethod
    def _serialize_session(cls, admin, row: Dict[str, Any]) -> AttendanceSessionResponse:
        subject_name = None
        subject_code = None
        class_name = None
        department_code = None
        academic_year = None
        try:
            relation = (
                admin.from_("faculty_subject_assignments")
                .select(
                    "subject:subjects(code, name), "
                    "class:classes(name, academic_year, department:departments(code))"
                )
                .eq("id", str(row["assignment_id"]))
                .single()
                .execute()
            )
        except Exception as exc:
            cls._log_backend_error("faculty.session.metadata", exc)
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "Session metadata could not be loaded.",
            ) from exc
        if cls._response_error(relation) or not relation.data:
            cls._log_backend_error(
                "faculty.session.metadata",
                getattr(relation, "error", None) or getattr(relation, "data", None),
            )
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "Session metadata could not be loaded.",
            )
        subject = relation.data.get("subject") or {}
        class_row = relation.data.get("class") or {}
        department = class_row.get("department") or {}
        subject_name = subject.get("name")
        subject_code = subject.get("code")
        class_name = class_row.get("name")
        academic_year = class_row.get("academic_year")
        department_code = department.get("code")
        return AttendanceSessionResponse(
            id=row["id"],
            assignment_id=row["assignment_id"],
            created_by=row["created_by"],
            session_date=row["session_date"],
            start_time=row["start_time"],
            end_time=row.get("end_time"),
            status=row["status"],
            verification_method=row["verification_method"],
            notes=row.get("notes"),
            subject_code=subject_code,
            subject_name=subject_name,
            class_name=class_name,
            department_code=department_code,
            academic_year=academic_year,
        )

    @classmethod
    async def list_sessions(
        cls,
        faculty_id: UUID,
        session_date: Optional[date] = None,
    ) -> List[AttendanceSessionResponse]:
        admin = cls._admin()
        try:
            query = (
                admin.from_("attendance_sessions")
                .select("*")
                .eq("created_by", str(faculty_id))
                .order("start_time", desc=True)
            )
            if session_date:
                query = query.eq("session_date", session_date.isoformat())
            response = query.execute()
        except Exception as exc:
            cls._log_backend_error("faculty.sessions.list", exc)
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load attendance sessions.") from exc
        if cls._response_error(response):
            cls._log_backend_error(
                "faculty.sessions.list",
                getattr(response, "error", None) or getattr(response, "data", None),
            )
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load attendance sessions.")
        return [cls._serialize_session(admin, row) for row in response.data or []]

    @classmethod
    async def get_session(cls, faculty_id: UUID, session_id: UUID) -> AttendanceSessionResponse:
        admin = cls._admin()
        try:
            response = (
                admin.from_("attendance_sessions")
                .select("*")
                .eq("id", str(session_id))
                .eq("created_by", str(faculty_id))
                .single()
                .execute()
            )
        except Exception as exc:
            if cls._exception_error_code(exc) == "PGRST116":
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found or not owned by you.") from exc
            cls._log_backend_error("faculty.session.get", exc)
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not verify session ownership.") from exc
        if cls._response_error(response):
            code = cls._response_error_code(response)
            if code == "PGRST116":
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found or not owned by you.")
            cls._log_backend_error(
                "faculty.session.get",
                getattr(response, "error", None) or getattr(response, "data", None),
            )
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not verify session ownership.")
        if not response.data:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found or not owned by you.")
        return cls._serialize_session(admin, response.data)

    @classmethod
    async def get_session_attendance(
        cls,
        faculty_id: UUID,
        session_id: UUID,
    ) -> List[FacultyAttendanceRecordResponse]:
        await cls.get_session(faculty_id, session_id)
        admin = cls._admin()
        try:
            response = (
                admin.from_("attendance_records")
                .select(
                    "id, session_id, student_id, status, marked_at, "
                    "student:students(roll_number, registration_number, "
                    "profile:profiles(full_name))"
                )
                .eq("session_id", str(session_id))
                .order("marked_at")
                .execute()
            )
        except Exception as exc:
            cls._log_backend_error("faculty.session.attendance", exc)
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load session attendance.") from exc
        if cls._response_error(response):
            cls._log_backend_error(
                "faculty.session.attendance",
                getattr(response, "error", None) or getattr(response, "data", None),
            )
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load session attendance.")

        results = []
        for row in response.data or []:
            student = row.get("student") or {}
            profile = student.get("profile") or {}
            results.append(
                FacultyAttendanceRecordResponse(
                    id=row["id"],
                    session_id=row["session_id"],
                    student_id=row["student_id"],
                    status=row["status"],
                    marked_at=row["marked_at"],
                    full_name=profile.get("full_name"),
                    roll_number=student.get("roll_number"),
                    registration_number=student.get("registration_number"),
                )
            )
        return results

    @classmethod
    async def transition_session(
        cls,
        faculty_id: UUID,
        session_id: UUID,
        target_status: str,
    ) -> AttendanceSessionResponse:
        admin = cls._admin()
        session = await cls.get_session(faculty_id, session_id)
        if target_status == "completed":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Use the finalize operation to complete a session.")
        if target_status not in ("active_scanning", "review_pending", "cancelled"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid target status.")
        allowed = {
            "scheduled": ("active_scanning", "cancelled"),
            "active_scanning": ("review_pending", "cancelled"),
            "review_pending": ("cancelled",),
        }
        if target_status not in allowed.get(session.status, ()):
            raise HTTPException(status.HTTP_409_CONFLICT, "Invalid attendance session state transition.")
        try:
            response = (
                admin.from_("attendance_sessions")
                .update({"status": target_status})
                .eq("id", str(session_id))
                .eq("created_by", str(faculty_id))
                .execute()
            )
        except Exception as exc:
            cls._log_backend_error("faculty.session.transition", exc)
            raise HTTPException(status.HTTP_409_CONFLICT, "Session transition could not be applied.") from exc
        rows = getattr(response, "data", None)
        if cls._response_error(response) or not isinstance(rows, list) or not rows:
            cls._log_backend_error(
                "faculty.session.transition",
                getattr(response, "error", None) or getattr(response, "data", None),
            )
            raise HTTPException(status.HTTP_409_CONFLICT, "Session transition could not be applied.")
        return cls._serialize_session(admin, rows[0])

    @classmethod
    async def finalize_session(
        cls,
        faculty_id: UUID,
        session_id: UUID,
        notes: Optional[str],
        access_token: str = "",
    ) -> SessionFinalizeResponse:
        await cls.get_session(faculty_id, session_id)
        user_client = get_supabase_user_client(access_token)
        if not user_client:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Authenticated database access is not configured.",
            )
        try:
            response = user_client.rpc(
                "fn_finalize_attendance_session",
                {"p_session_id": str(session_id), "p_notes": notes},
            ).execute()
        except Exception as exc:
            cls._log_backend_error("faculty.session.finalize", exc)
            raise HTTPException(status.HTTP_409_CONFLICT, "Session could not be finalized.") from exc
        error = cls._response_error(response)
        if error or not response.data:
            cls._log_backend_error(
                "faculty.session.finalize",
                getattr(response, "error", None) or getattr(response, "data", None),
            )
            raise HTTPException(status.HTTP_409_CONFLICT, "Session could not be finalized.")
        try:
            data = response.data
            if isinstance(data, list) and len(data) == 1:
                data = data[0]
            if not isinstance(data, dict):
                raise ValueError("Unexpected RPC response")
            return SessionFinalizeResponse(
                status=data["status"],
                session_id=data["session_id"],
                present_count=data["present_count"],
                absent_count=data["absent_count"],
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "The finalization service returned an unexpected response.",
            ) from exc

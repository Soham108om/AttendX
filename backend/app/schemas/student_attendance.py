from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel


class ActiveStudentAttendanceSession(BaseModel):
    id: UUID
    session_date: date
    status: Literal["active_scanning"]
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    class_name: Optional[str] = None
    attendance_status: Optional[Literal["present", "late", "absent", "excused"]] = None
    marked_at: Optional[datetime] = None


class StudentAttendanceVerificationResponse(BaseModel):
    status: Literal["recorded", "already_recorded"]
    session_id: UUID
    attendance_status: Literal["present", "late", "absent", "excused"]


class StudentAttendanceHistoryRecord(BaseModel):
    session_id: UUID
    session_date: date
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    status: Literal["present", "late", "absent", "excused"]


class FacultyAttendanceRecordResponse(BaseModel):
    id: UUID
    session_id: UUID
    student_id: UUID
    status: Literal["present", "late", "absent", "excused", "not_marked"]
    marked_at: Optional[datetime] = None
    full_name: Optional[str] = None
    roll_number: Optional[str] = None
    registration_number: Optional[str] = None

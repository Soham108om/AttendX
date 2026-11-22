from datetime import date
from typing import Literal, Optional
from uuid import UUID
from pydantic import BaseModel, Field


SessionStatus = Literal[
    "scheduled",
    "active_scanning",
    "review_pending",
    "completed",
    "cancelled",
]


class FacultyAssignmentResponse(BaseModel):
    id: UUID
    faculty_id: UUID
    subject_id: UUID
    class_id: UUID
    is_active: bool
    subject_code: Optional[str] = None
    subject_name: Optional[str] = None
    department_id: Optional[UUID] = None
    department_code: Optional[str] = None
    department_name: Optional[str] = None
    class_name: Optional[str] = None
    academic_year: Optional[str] = None
    semester: Optional[int] = None


class SessionCreateRequest(BaseModel):
    assignment_id: UUID
    session_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=5000)


class SessionTransitionRequest(BaseModel):
    status: Literal["active_scanning", "review_pending", "cancelled"]


class SessionFinalizeRequest(BaseModel):
    notes: Optional[str] = Field(None, max_length=5000)


class SessionFinalizeResponse(BaseModel):
    status: Literal["success"]
    session_id: UUID
    present_count: int
    absent_count: int


class AttendanceSessionResponse(BaseModel):
    id: UUID
    assignment_id: UUID
    created_by: UUID
    session_date: date
    start_time: str
    end_time: Optional[str] = None
    status: SessionStatus
    verification_method: str
    notes: Optional[str] = None
    subject_code: Optional[str] = None
    subject_name: Optional[str] = None
    class_name: Optional[str] = None
    department_code: Optional[str] = None
    academic_year: Optional[str] = None

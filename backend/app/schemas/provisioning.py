from typing import Optional, Any, Dict, List, Literal
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field


# ------------------------------------------------------------------------------
# Faculty Provisioning Schemas
# ------------------------------------------------------------------------------

class FacultyProvisionRequest(BaseModel):
    email: EmailStr = Field(..., description="Institutional email for the faculty member")
    full_name: str = Field(..., min_length=2, max_length=255, description="Full name of the faculty member")
    faculty_id_number: str = Field(..., min_length=2, max_length=50, description="Unique faculty identification code")
    department_id: UUID = Field(..., description="UUID of the academic department")
    designation: str = Field(..., min_length=2, max_length=100, description="Academic title/designation")
    initial_password: Optional[str] = Field(None, min_length=8, description="Optional custom initial password")


class FacultyUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    faculty_id_number: Optional[str] = Field(None, min_length=2, max_length=50)
    department_id: Optional[UUID] = None
    designation: Optional[str] = Field(None, min_length=2, max_length=100)


class FacultyResponse(BaseModel):
    id: UUID
    email: Optional[str] = None
    full_name: Optional[str] = None
    faculty_id_number: str
    department_id: UUID
    designation: str
    department_code: Optional[str] = None
    department_name: Optional[str] = None
    is_active: Optional[bool] = None
    account_status: Literal["active", "inactive", "unknown"] = "unknown"
    created_at: Optional[str] = None


# ------------------------------------------------------------------------------
# Student Provisioning Schemas
# ------------------------------------------------------------------------------

class StudentProvisionRequest(BaseModel):
    email: EmailStr = Field(..., description="Institutional email for the student")
    full_name: str = Field(..., min_length=2, max_length=255, description="Full name of the student")
    registration_number: str = Field(..., min_length=2, max_length=100, description="University registration number")
    roll_number: str = Field(..., min_length=1, max_length=50, description="Class roll number")
    class_id: UUID = Field(..., description="UUID of the enrolled class/section")
    initial_password: Optional[str] = Field(None, min_length=8, description="Optional custom initial password")


class StudentUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    registration_number: Optional[str] = Field(None, min_length=2, max_length=100)
    class_id: Optional[UUID] = None
    roll_number: Optional[str] = Field(None, min_length=1, max_length=50)


class StudentResponse(BaseModel):
    id: UUID
    email: Optional[str] = None
    full_name: Optional[str] = None
    registration_number: str
    roll_number: str
    class_id: UUID
    class_name: Optional[str] = None
    department_code: Optional[str] = None
    face_enrolled: bool = False
    is_active: Optional[bool] = None
    account_status: Literal["active", "inactive", "unknown"] = "unknown"
    created_at: Optional[str] = None


# ------------------------------------------------------------------------------
# Academic Assignment Schemas
# ------------------------------------------------------------------------------

class AssignmentCreateRequest(BaseModel):
    faculty_id: UUID = Field(..., description="UUID of the teaching faculty member")
    subject_id: UUID = Field(..., description="UUID of the subject course")
    class_id: UUID = Field(..., description="UUID of the target class/section")


class AssignmentResponse(BaseModel):
    id: UUID
    faculty_id: UUID
    subject_id: UUID
    class_id: UUID
    is_active: bool
    created_at: Optional[str] = None
    faculty_name: Optional[str] = None
    faculty_id_number: Optional[str] = None
    subject_code: Optional[str] = None
    subject_name: Optional[str] = None
    class_name: Optional[str] = None


# ------------------------------------------------------------------------------
# Provisioning Output Schema
# ------------------------------------------------------------------------------

class ProvisionResult(BaseModel):
    user_id: UUID
    email: str
    full_name: str
    role: str
    initial_password: str
    entity_id: UUID
    details: Dict[str, Any] = Field(default_factory=dict)
    message: str = "Account successfully provisioned."

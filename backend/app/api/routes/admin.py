from typing import List, Optional, Dict, Any
from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from app.core.security import get_current_admin_user
from app.services.provisioning_service import ProvisioningService
from app.schemas.provisioning import (
    FacultyProvisionRequest,
    FacultyUpdateRequest,
    StudentProvisionRequest,
    StudentUpdateRequest,
    AssignmentCreateRequest,
    ProvisionResult,
    FacultyResponse,
    StudentResponse,
    AssignmentResponse,
)
from app.schemas.student_biometric import ConsentStatusResponse
from app.services.student_biometric_service import StudentBiometricService

router = APIRouter(prefix="/admin", tags=["Admin Provisioning & Management"])


# ==============================================================================
# FACULTY PROVISIONING ENDPOINTS
# ==============================================================================

@router.post(
    "/provision/faculty",
    response_model=ProvisionResult,
    status_code=status.HTTP_201_CREATED,
    summary="Provision New Faculty Account",
)
async def provision_faculty_endpoint(
    req: FacultyProvisionRequest,
    current_admin: Dict[str, Any] = Depends(get_current_admin_user),
) -> ProvisionResult:
    """
    Creates a new Faculty member: Supabase Auth account, profiles row, and faculty row.
    Guarantees atomic rollback if any database step fails.
    """
    return await ProvisioningService.provision_faculty(req)


@router.get(
    "/faculty",
    response_model=List[FacultyResponse],
    summary="List All Faculty Members",
)
async def list_faculty_endpoint(
    current_admin: Dict[str, Any] = Depends(get_current_admin_user),
) -> List[Dict[str, Any]]:
    return await ProvisioningService.get_faculty_list()


@router.patch(
    "/faculty/{faculty_id}",
    summary="Update Faculty Details",
)
async def update_faculty_endpoint(
    faculty_id: UUID,
    req: FacultyUpdateRequest,
    current_admin: Dict[str, Any] = Depends(get_current_admin_user),
) -> Dict[str, Any]:
    return await ProvisioningService.update_faculty(faculty_id, req)


@router.post(
    "/faculty/{faculty_id}/deactivate",
    summary="Safely Deactivate Faculty Account",
)
async def deactivate_faculty_endpoint(
    faculty_id: UUID,
    current_admin: Dict[str, Any] = Depends(get_current_admin_user),
) -> Dict[str, Any]:
    return await ProvisioningService.deactivate_faculty(faculty_id)


# ==============================================================================
# STUDENT PROVISIONING ENDPOINTS
# ==============================================================================

@router.post(
    "/provision/student",
    response_model=ProvisionResult,
    status_code=status.HTTP_201_CREATED,
    summary="Provision New Student Account",
)
async def provision_student_endpoint(
    req: StudentProvisionRequest,
    current_admin: Dict[str, Any] = Depends(get_current_admin_user),
) -> ProvisionResult:
    """
    Creates a new Student: Supabase Auth account, profiles row, and students row.
    Guarantees atomic rollback if any database step fails.
    """
    return await ProvisioningService.provision_student(req)


@router.get(
    "/students",
    response_model=List[StudentResponse],
    summary="List Students (Optionally Filtered by Class)",
)
async def list_students_endpoint(
    class_id: Optional[UUID] = Query(None, description="Optional filter by class UUID"),
    current_admin: Dict[str, Any] = Depends(get_current_admin_user),
) -> List[Dict[str, Any]]:
    return await ProvisioningService.get_students_list(class_id)


@router.patch(
    "/students/{student_id}",
    summary="Update Student Details",
)
async def update_student_endpoint(
    student_id: UUID,
    req: StudentUpdateRequest,
    current_admin: Dict[str, Any] = Depends(get_current_admin_user),
) -> Dict[str, Any]:
    return await ProvisioningService.update_student(student_id, req)


@router.post(
    "/students/{student_id}/deactivate",
    summary="Safely Deactivate Student Account",
)
async def deactivate_student_endpoint(
    student_id: UUID,
    current_admin: Dict[str, Any] = Depends(get_current_admin_user),
) -> Dict[str, Any]:
    return await ProvisioningService.deactivate_student(student_id)


@router.get(
    "/students/{student_id}/consent",
    response_model=ConsentStatusResponse,
    summary="Inspect a Student's Biometric Consent",
)
async def inspect_student_consent_endpoint(
    student_id: UUID,
    current_admin: Dict[str, Any] = Depends(get_current_admin_user),
) -> Dict[str, Any]:
    return await StudentBiometricService.get_consent(student_id)


# ==============================================================================
# ACADEMIC ASSIGNMENTS ENDPOINTS
# ==============================================================================

@router.get(
    "/assignments",
    response_model=List[AssignmentResponse],
    summary="List Faculty Subject-Class Assignments",
)
async def list_assignments_endpoint(
    current_admin: Dict[str, Any] = Depends(get_current_admin_user),
) -> List[Dict[str, Any]]:
    return await ProvisioningService.get_assignments_list()


@router.post(
    "/assignments",
    status_code=status.HTTP_201_CREATED,
    summary="Assign Faculty to Subject and Class",
)
async def create_assignment_endpoint(
    req: AssignmentCreateRequest,
    current_admin: Dict[str, Any] = Depends(get_current_admin_user),
) -> Dict[str, Any]:
    return await ProvisioningService.create_assignment(req)


@router.patch(
    "/assignments/{assignment_id}/toggle-active",
    summary="Toggle Assignment Active Status",
)
async def toggle_assignment_endpoint(
    assignment_id: UUID,
    current_admin: Dict[str, Any] = Depends(get_current_admin_user),
) -> Dict[str, Any]:
    return await ProvisioningService.toggle_assignment_status(assignment_id)

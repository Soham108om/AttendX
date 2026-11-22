from datetime import date
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.security import get_current_faculty_user
from app.schemas.faculty import (
    FacultyAssignmentResponse,
    AttendanceSessionResponse,
    SessionCreateRequest,
    SessionTransitionRequest,
    SessionFinalizeRequest,
    SessionFinalizeResponse,
)
from app.schemas.student_attendance import FacultyAttendanceRecordResponse
from app.services.faculty_service import FacultyService


router = APIRouter(prefix="/faculty", tags=["Faculty Sessions"])


@router.get("/assignments", response_model=List[FacultyAssignmentResponse])
async def list_assignments(
    current_faculty=Depends(get_current_faculty_user),
) -> List[FacultyAssignmentResponse]:
    return await FacultyService.get_assignments(UUID(str(current_faculty["id"])))


@router.post("/sessions", response_model=AttendanceSessionResponse, status_code=201)
async def create_session(
    req: SessionCreateRequest,
    current_faculty=Depends(get_current_faculty_user),
) -> AttendanceSessionResponse:
    return await FacultyService.create_session(UUID(str(current_faculty["id"])), req)


@router.get("/sessions", response_model=List[AttendanceSessionResponse])
async def list_sessions(
    session_date: Optional[date] = Query(None),
    current_faculty=Depends(get_current_faculty_user),
) -> List[AttendanceSessionResponse]:
    return await FacultyService.list_sessions(UUID(str(current_faculty["id"])), session_date)


@router.get("/sessions/{session_id}", response_model=AttendanceSessionResponse)
async def get_session(
    session_id: UUID,
    current_faculty=Depends(get_current_faculty_user),
) -> AttendanceSessionResponse:
    return await FacultyService.get_session(UUID(str(current_faculty["id"])), session_id)


@router.get(
    "/sessions/{session_id}/attendance",
    response_model=List[FacultyAttendanceRecordResponse],
)
async def get_session_attendance(
    session_id: UUID,
    current_faculty=Depends(get_current_faculty_user),
):
    return await FacultyService.get_session_attendance(
        UUID(str(current_faculty["id"])),
        session_id,
    )


@router.patch("/sessions/{session_id}/transition", response_model=AttendanceSessionResponse)
async def transition_session(
    session_id: UUID,
    req: SessionTransitionRequest,
    current_faculty=Depends(get_current_faculty_user),
) -> AttendanceSessionResponse:
    return await FacultyService.transition_session(
        UUID(str(current_faculty["id"])),
        session_id,
        req.status,
    )


@router.post(
    "/sessions/{session_id}/finalize",
    response_model=SessionFinalizeResponse,
)
async def finalize_session(
    session_id: UUID,
    req: SessionFinalizeRequest,
    current_faculty=Depends(get_current_faculty_user),
):
    return await FacultyService.finalize_session(
        UUID(str(current_faculty["id"])),
        session_id,
        req.notes,
        str(current_faculty.get("access_token") or ""),
    )

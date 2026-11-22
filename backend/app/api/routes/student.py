from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from app.core.security import get_current_student_user
from app.schemas.student_biometric import (
    ConsentActionResponse,
    ConsentStatusResponse,
    EnrolmentResponse,
    RevocationResponse,
)
from app.schemas.student_attendance import (
    ActiveStudentAttendanceSession,
    StudentAttendanceHistoryRecord,
    StudentAttendanceVerificationResponse,
)
from app.services.face_recognition_service import face_recognition_service
from app.services.student_biometric_service import StudentBiometricService


router = APIRouter(prefix="/student", tags=["Student Biometrics"])


@router.get("/consent", response_model=ConsentStatusResponse)
async def get_consent(
    current_student=Depends(get_current_student_user),
):
    student_id = UUID(str(current_student["id"]))
    return await StudentBiometricService.get_consent(student_id)


@router.post("/consent", response_model=ConsentActionResponse)
async def give_consent(
    request: Request,
    current_student=Depends(get_current_student_user),
):
    student_id = UUID(str(current_student["id"]))
    ip_address = StudentBiometricService.derive_ip(request)
    user_agent = request.headers.get("user-agent")
    if user_agent:
        user_agent = user_agent[:10000]
    return await StudentBiometricService.give_consent(
        student_id,
        ip_address,
        user_agent,
    )


@router.post("/consent/revoke", response_model=RevocationResponse)
async def revoke_consent(
    current_student=Depends(get_current_student_user),
):
    student_id = UUID(str(current_student["id"]))
    return await StudentBiometricService.revoke_consent(student_id)


@router.post("/face-enrolment", response_model=EnrolmentResponse)
async def enrol_face(
    samples: List[UploadFile] = File(...),
    current_student=Depends(get_current_student_user),
):
    student_id = UUID(str(current_student["id"]))
    if len(samples) != StudentBiometricService.REQUIRED_SAMPLES:
        raise StudentBiometricService.api_error(
            status.HTTP_400_BAD_REQUEST,
            "INVALID_IMAGE_OR_FACE",
            f"Exactly {StudentBiometricService.REQUIRED_SAMPLES} face samples are required.",
        )

    images = []
    for sample in samples:
        content = await sample.read(StudentBiometricService.MAX_IMAGE_BYTES + 1)
        if len(content) > StudentBiometricService.MAX_IMAGE_BYTES:
            raise StudentBiometricService.api_error(
                status.HTTP_400_BAD_REQUEST,
                "INVALID_IMAGE_OR_FACE",
                "A face sample exceeds the size limit.",
            )
        if not content:
            raise StudentBiometricService.api_error(
                status.HTTP_400_BAD_REQUEST,
                "INVALID_IMAGE_OR_FACE",
                "A face sample is empty.",
            )
        images.append(content)

    return await StudentBiometricService.enrol(
        student_id,
        images,
        face_recognition_service,
    )


@router.get(
    "/attendance/sessions",
    response_model=List[ActiveStudentAttendanceSession],
)
async def list_active_attendance_sessions(
    current_student=Depends(get_current_student_user),
):
    return await StudentBiometricService.list_active_attendance_sessions(
        UUID(str(current_student["id"]))
    )


@router.get(
    "/attendance/history",
    response_model=List[StudentAttendanceHistoryRecord],
)
async def list_attendance_history(
    current_student=Depends(get_current_student_user),
):
    return await StudentBiometricService.list_attendance_history(
        student_id=UUID(str(current_student["id"])),
        access_token=str(current_student.get("access_token") or ""),
    )


@router.post(
    "/attendance/sessions/{session_id}/verify",
    response_model=StudentAttendanceVerificationResponse,
)
async def verify_attendance(
    session_id: UUID,
    frame: UploadFile = File(...),
    current_student=Depends(get_current_student_user),
):
    image_bytes = await frame.read(StudentBiometricService.MAX_IMAGE_BYTES + 1)
    if len(image_bytes) > StudentBiometricService.MAX_IMAGE_BYTES:
        raise StudentBiometricService.api_error(
            status.HTTP_400_BAD_REQUEST,
            "INVALID_IMAGE_OR_FACE",
            "The captured frame exceeds the size limit.",
        )
    return await StudentBiometricService.verify_attendance(
        student_id=UUID(str(current_student["id"])),
        session_id=session_id,
        image_bytes=image_bytes,
        access_token=str(current_student.get("access_token") or ""),
        face_service=face_recognition_service,
    )

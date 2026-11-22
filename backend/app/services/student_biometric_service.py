from __future__ import annotations

import ipaddress
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

import numpy as np
from fastapi import HTTPException, status

from app.core.config import settings
from app.core.supabase import get_supabase_admin_client, get_supabase_user_client
from app.services.face_recognition_service import FaceRecognitionService
from app.services.attendance_attestation import issue_attestation
from app.schemas.student_attendance import (
    ActiveStudentAttendanceSession,
    StudentAttendanceHistoryRecord,
    StudentAttendanceVerificationResponse,
)


class StudentBiometricService:
    MODEL_VERSION = "sface_2021dec"
    REQUIRED_SAMPLES = 5
    MIN_SAMPLE_QUALITY = 0.9
    MAX_IMAGE_BYTES = 10 * 1024 * 1024
    MAX_TOTAL_BYTES = 30 * 1024 * 1024

    @classmethod
    def has_complete_enrolment(cls, face_enrolled: Any, embeddings: Any) -> bool:
        if face_enrolled is not True or not isinstance(embeddings, list):
            return False
        if len(embeddings) != cls.REQUIRED_SAMPLES:
            return False

        sample_indices = set()
        for row in embeddings:
            if not isinstance(row, dict) or row.get("is_active") is not True:
                return False
            sample_index = row.get("sample_index")
            if isinstance(sample_index, bool) or not isinstance(sample_index, int):
                return False
            sample_indices.add(sample_index)

            if row.get("model_version") != cls.MODEL_VERSION:
                return False
            quality_score = row.get("quality_score")
            if (
                isinstance(quality_score, bool)
                or not isinstance(quality_score, (int, float))
                or not math.isfinite(quality_score)
                or not cls.MIN_SAMPLE_QUALITY <= quality_score <= 1.0
            ):
                return False

            vector = row.get("embedding_vector")
            if isinstance(vector, str):
                encoded = vector.strip()
                if not encoded.startswith("[") or not encoded.endswith("]"):
                    return False
                components = encoded[1:-1].split(",")
            elif isinstance(vector, (list, tuple)):
                components = vector
            else:
                return False

            if len(components) != 128:
                return False
            try:
                values = [
                    float(component)
                    for component in components
                    if not isinstance(component, bool)
                ]
            except (TypeError, ValueError):
                return False
            if len(values) != 128 or not all(math.isfinite(value) for value in values):
                return False
            norm = math.sqrt(sum(value * value for value in values))
            if norm == 0.0 or abs(norm - 1.0) > 1e-3:
                return False

        return sample_indices == set(range(1, cls.REQUIRED_SAMPLES + 1))

    @staticmethod
    def _admin():
        admin = get_supabase_admin_client()
        if not admin:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Database service is not configured.")
        return admin

    @staticmethod
    def api_error(status_code: int, code: str, message: str) -> HTTPException:
        return HTTPException(
            status_code=status_code,
            detail={"code": code, "message": message},
        )

    @staticmethod
    def _response_error(response: Any) -> Optional[str]:
        error = getattr(response, "error", None)
        if error:
            return str(getattr(error, "message", error))
        data = getattr(response, "data", None)
        if isinstance(data, dict) and data.get("error"):
            return str(data.get("message") or data["error"])
        return None

    @classmethod
    def _response_code(cls, response: Any) -> Optional[str]:
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
    def _find_error_code(cls, value: Any, depth: int = 0) -> Optional[str]:
        if value is None or depth > 6:
            return None
        if isinstance(value, dict):
            for key in ("code", "error_code", "status_code", "sqlstate"):
                code = value.get(key)
                if code:
                    return str(code)
            for key in ("error", "details", "response", "context", "cause"):
                code = cls._find_error_code(value.get(key), depth + 1)
                if code:
                    return code
            return None
        for attr in ("code", "error_code", "status_code", "sqlstate"):
            code = getattr(value, attr, None)
            if code:
                return str(code)
        for attr in ("error", "details", "response", "context", "cause"):
            code = cls._find_error_code(getattr(value, attr, None), depth + 1)
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
    def _verify_student_face_enrolled(cls, admin: Any, student_id: UUID, expected: bool) -> bool:
        try:
            response = (
                admin.from_("students")
                .select("face_enrolled")
                .eq("id", str(student_id))
                .maybe_single()
                .execute()
            )
            if response is None or cls._response_error(response) or not response.data:
                return False
            return bool(response.data.get("face_enrolled")) is expected
        except Exception:
            return False

    @classmethod
    def _verify_embeddings_deleted(cls, admin: Any, student_id: UUID) -> bool:
        try:
            response = (
                admin.from_("face_embeddings")
                .select("id")
                .eq("student_id", str(student_id))
                .execute()
            )
            if cls._response_error(response):
                return False
            return not bool(response.data)
        except Exception:
            return False

    @classmethod
    def _verify_inserted_embeddings_deleted(
        cls,
        admin: Any,
        inserted_ids: List[str],
    ) -> bool:
        for embedding_id in inserted_ids:
            try:
                response = (
                    admin.from_("face_embeddings")
                    .select("id")
                    .eq("id", embedding_id)
                    .execute()
                )
                if cls._response_error(response) or bool(response.data):
                    return False
            except Exception:
                return False
        return True

    @classmethod
    def _exception_error_code(cls, exc: Any) -> Optional[str]:
        code = cls._find_error_code(exc)
        if code:
            return code
        message = str(exc)
        if "23505" in message:
            return "23505"
        return None

    @classmethod
    async def verify_student(cls, student_id: UUID) -> Dict[str, Any]:
        admin = cls._admin()
        try:
            response = (
                admin.from_("students")
                .select("id, face_enrolled")
                .eq("id", str(student_id))
                .single()
                .execute()
            )
        except Exception as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Student record not found.") from exc
        if cls._response_error(response) or not response.data:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Student record not found.")
        return response.data

    @classmethod
    async def get_consent(cls, student_id: UUID) -> Dict[str, Any]:
        student = await cls.verify_student(student_id)
        admin = cls._admin()
        try:
            response = (
                admin.from_("biometric_consents")
                .select("consent_given, consent_timestamp, revoked_at")
                .eq("student_id", str(student_id))
                .maybe_single()
                .execute()
            )
        except Exception as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load consent status.") from exc
        if response is not None and cls._response_error(response):
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load consent status.")
        row = response.data if response is not None else None
        if not row:
            consent_given = False
            consent_timestamp = None
            revoked_at = None
            active = False
        else:
            consent_given = bool(row.get("consent_given"))
            consent_timestamp = row.get("consent_timestamp")
            revoked_at = row.get("revoked_at")
            active = consent_given and revoked_at is None

        try:
            embeddings = (
                admin.from_("face_embeddings")
                .select("id, sample_index, is_active, model_version, quality_score, embedding_vector")
                .eq("student_id", str(student_id))
                .execute()
            )
        except Exception as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not verify enrolment status.") from exc
        if embeddings is None or cls._response_error(embeddings):
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not verify enrolment status.")

        embedding_rows = getattr(embeddings, "data", None) or []
        has_records = bool(embedding_rows)
        face_enrolled_flag = bool(student.get("face_enrolled"))
        face_enrolled = cls.has_complete_enrolment(face_enrolled_flag, embedding_rows)
        if revoked_at is not None or (row is not None and not consent_given):
            enrolment_state = "consent_revoked"
        elif not active:
            if has_records:
                enrolment_state = "blocked_existing_records"
            elif face_enrolled_flag:
                enrolment_state = "review_required"
            else:
                enrolment_state = "consent_not_given"
        elif face_enrolled and has_records:
            enrolment_state = "face_enrolled"
        elif has_records:
            enrolment_state = "blocked_existing_records"
        elif face_enrolled_flag:
            enrolment_state = "review_required"
        else:
            enrolment_state = "consent_active_face_not_enrolled"

        return {
            "consent_given": consent_given,
            "consent_timestamp": consent_timestamp,
            "revoked_at": revoked_at,
            "active": active,
            "face_enrolled": face_enrolled,
            "has_biometric_records": has_records,
            "enrolment_state": enrolment_state,
        }

    @staticmethod
    def derive_ip(request) -> str:
        client_host = request.client.host if request.client else ""
        if not client_host:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "A valid request IP address is required.")
        try:
            parsed = ipaddress.ip_address(client_host)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "A valid request IP address is required.") from exc
        value = parsed.compressed
        if len(value.encode("utf-8")) > 45:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Request IP address is too long.")
        return value

    @classmethod
    async def give_consent(
        cls,
        student_id: UUID,
        ip_address: str,
        user_agent: Optional[str],
    ) -> Dict[str, Any]:
        await cls.verify_student(student_id)
        admin = cls._admin()

        try:
            existing = (
                admin.from_("biometric_consents")
                .select("id")
                .eq("student_id", str(student_id))
                .maybe_single()
                .execute()
            )
        except Exception as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not verify consent record.") from exc
        if existing is not None and cls._response_error(existing):
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not verify consent record.")

        now_iso = datetime.now(timezone.utc).isoformat()

        if existing is not None and existing.data:
            payload = {
                "consent_given": True,
                "revoked_at": None,
                "consent_timestamp": now_iso,
                "ip_address": ip_address,
                "user_agent": user_agent,
            }
            try:
                updated = (
                    admin.from_("biometric_consents")
                    .update(payload)
                    .eq("student_id", str(student_id))
                    .execute()
                )
            except Exception as exc:
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Consent could not be recorded.") from exc
            if updated is None or cls._response_error(updated):
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Consent could not be recorded.")
            rows = getattr(updated, "data", None)
            row = rows[0] if (isinstance(rows, list) and len(rows) > 0 and isinstance(rows[0], dict)) else payload
        else:
            payload = {
                "student_id": str(student_id),
                "consent_given": True,
                "consent_timestamp": now_iso,
                "revoked_at": None,
                "ip_address": ip_address,
                "user_agent": user_agent,
            }
            try:
                inserted = (
                    admin.from_("biometric_consents")
                    .insert([payload])
                    .execute()
                )
            except Exception as exc:
                code = cls._exception_error_code(exc)
                if code == "23505":
                    raise HTTPException(status.HTTP_409_CONFLICT, "Consent record already exists.") from exc
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Consent could not be recorded.") from exc
            if inserted is None or cls._response_error(inserted):
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Consent could not be recorded.")
            rows = getattr(inserted, "data", None)
            row = rows[0] if (isinstance(rows, list) and len(rows) > 0 and isinstance(rows[0], dict)) else payload

        return {
            "status": "consent_recorded",
            "active": True,
            "consent_timestamp": row.get("consent_timestamp", now_iso),
            "revoked_at": row.get("revoked_at"),
        }

    @classmethod
    async def revoke_consent(cls, student_id: UUID) -> Dict[str, Any]:
        await cls.verify_student(student_id)
        admin = cls._admin()
        now = datetime.now(timezone.utc).isoformat()

        try:
            consent = (
                admin.from_("biometric_consents")
                .update({"consent_given": False, "revoked_at": now})
                .eq("student_id", str(student_id))
                .execute()
            )
        except Exception as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Consent revocation could not be recorded.") from exc
        if consent is None or cls._response_error(consent):
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Consent revocation could not be recorded.")

        try:
            verified_consent = (
                admin.from_("biometric_consents")
                .select("consent_given, revoked_at")
                .eq("student_id", str(student_id))
                .maybe_single()
                .execute()
            )
            consent_verified = (
                verified_consent is not None
                and not cls._response_error(verified_consent)
                and bool(verified_consent.data)
                and verified_consent.data.get("consent_given") is False
                and verified_consent.data.get("revoked_at") is not None
            )
        except Exception:
            consent_verified = False
        if not consent_verified:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Consent revocation could not be verified.")

        embeddings_deleted = True
        cleanup_error = False
        try:
            deleted = admin.from_("face_embeddings").delete().eq("student_id", str(student_id)).execute()
            if cls._response_error(deleted):
                embeddings_deleted = False
                cleanup_error = True
        except Exception:
            embeddings_deleted = False
            cleanup_error = True
        if embeddings_deleted:
            embeddings_deleted = cls._verify_embeddings_deleted(admin, student_id)
            if not embeddings_deleted:
                cleanup_error = True

        student_updated = True
        try:
            updated = (
                admin.from_("students")
                .update({"face_enrolled": False})
                .eq("id", str(student_id))
                .execute()
            )
            if cls._response_error(updated):
                cleanup_error = True
                student_updated = False
        except Exception:
            cleanup_error = True
            student_updated = False
        if student_updated:
            student_updated = cls._verify_student_face_enrolled(admin, student_id, False)
            if not student_updated:
                cleanup_error = True

        if cleanup_error:
            return {
                "status": "partial_revocation",
                "consent_active": False,
                "embeddings_deleted": embeddings_deleted,
                "face_enrolled": False if student_updated else True,
                "error_code": "PARTIAL_REVOCATION",
            }
        return {
            "status": "consent_revoked",
            "consent_active": False,
            "embeddings_deleted": embeddings_deleted,
            "face_enrolled": False,
        }

    @classmethod
    async def enrol(
        cls,
        student_id: UUID,
        image_bytes: List[bytes],
        face_service: FaceRecognitionService,
    ) -> Dict[str, Any]:
        await cls.verify_student(student_id)
        consent = await cls.get_consent(student_id)
        if not consent["active"]:
            raise cls.api_error(status.HTTP_403_FORBIDDEN, "MISSING_OR_REVOKED_CONSENT", "Active biometric consent is required.")

        if (
            consent["face_enrolled"]
            or consent["has_biometric_records"]
            or consent["enrolment_state"] in ("face_enrolled", "blocked_existing_records", "review_required")
        ):
            raise cls.api_error(
                status.HTTP_409_CONFLICT,
                "EXISTING_ENROLMENT",
                "Existing biometric records or status require administrator review before enrolment.",
            )

        if len(image_bytes) != cls.REQUIRED_SAMPLES:
            raise cls.api_error(
                status.HTTP_400_BAD_REQUEST,
                "INVALID_IMAGE_OR_FACE",
                f"Exactly {cls.REQUIRED_SAMPLES} face samples are required.",
            )
        if sum(len(image) for image in image_bytes) > cls.MAX_TOTAL_BYTES:
            raise cls.api_error(status.HTTP_400_BAD_REQUEST, "INVALID_IMAGE_OR_FACE", "Combined face samples exceed the size limit.")
        if any(len(image) > cls.MAX_IMAGE_BYTES for image in image_bytes):
            raise cls.api_error(status.HTTP_400_BAD_REQUEST, "INVALID_IMAGE_OR_FACE", "A face sample exceeds the size limit.")

        admin = cls._admin()
        try:
            existing = (
                admin.from_("face_embeddings")
                .select("sample_index")
                .eq("student_id", str(student_id))
                .execute()
            )
        except Exception as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not verify existing samples.") from exc
        if cls._response_error(existing):
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not verify existing samples.")
        if existing.data:
            raise cls.api_error(status.HTTP_409_CONFLICT, "EXISTING_ENROLMENT", "Face enrolment already exists. Duplicate samples cannot be overwritten.")

        embeddings: List[np.ndarray] = []
        quality_scores: List[float] = []
        for image in image_bytes:
            try:
                result = face_service.extract_embedding(image)
            except Exception as exc:
                raise cls.api_error(
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                    "UNEXPECTED_BACKEND_ERROR",
                    "Face processing is temporarily unavailable. Try again later.",
                ) from exc
            if not isinstance(result, dict):
                raise cls.api_error(
                    status.HTTP_502_BAD_GATEWAY,
                    "UNEXPECTED_BACKEND_ERROR",
                    "Face processing returned an invalid result.",
                )
            status_value = result.get("status")
            if status_value != "success":
                if status_value == "model_error":
                    raise cls.api_error(
                        status.HTTP_503_SERVICE_UNAVAILABLE,
                        "UNEXPECTED_BACKEND_ERROR",
                        "Face processing is temporarily unavailable. Try again later.",
                    )
                rejection_messages = {
                    "invalid_image": "This sample is not a valid image. Retake it and try again.",
                    "no_face": "No face was detected in this sample. Center your face and retake it.",
                    "multiple_faces": "More than one face was detected. Capture only yourself in the frame.",
                    "poor_quality": "This sample is too blurry, small, or poorly lit. Improve the lighting and hold steady.",
                }
                message = rejection_messages.get(
                    status_value,
                    "This face sample could not be validated. Retake it and try again.",
                )
                raise cls.api_error(status.HTTP_400_BAD_REQUEST, "INVALID_IMAGE_OR_FACE", message)
            embedding = result.get("embedding")
            if not isinstance(embedding, np.ndarray):
                raise cls.api_error(status.HTTP_502_BAD_GATEWAY, "UNEXPECTED_BACKEND_ERROR", "Face processing returned an invalid representation.")
            if embedding.shape != (128,) or embedding.dtype not in (np.dtype("float32"), np.dtype("float64")):
                raise cls.api_error(status.HTTP_502_BAD_GATEWAY, "UNEXPECTED_BACKEND_ERROR", "Face processing returned an invalid representation.")
            if not np.all(np.isfinite(embedding)):
                raise cls.api_error(status.HTTP_502_BAD_GATEWAY, "UNEXPECTED_BACKEND_ERROR", "Face processing returned an invalid representation.")
            norm = float(np.linalg.norm(embedding))
            if norm == 0.0 or abs(norm - 1.0) > 1e-3:
                raise cls.api_error(status.HTTP_502_BAD_GATEWAY, "UNEXPECTED_BACKEND_ERROR", "Face processing returned an invalid representation.")
            quality_score = result.get("quality_score")
            if (
                isinstance(quality_score, bool)
                or not isinstance(quality_score, (int, float, np.number))
                or not np.isfinite(quality_score)
                or not cls.MIN_SAMPLE_QUALITY <= float(quality_score) <= 1.0
            ):
                raise cls.api_error(
                    status.HTTP_400_BAD_REQUEST,
                    "INVALID_IMAGE_OR_FACE",
                    "This sample did not meet the face-quality threshold. Improve lighting and focus, then retake it.",
                )
            embeddings.append(embedding)
            quality_scores.append(float(quality_score))

        inserted_ids: List[str] = []
        try:
            for sample_index, (embedding, quality_score) in enumerate(zip(embeddings, quality_scores), start=1):
                response = (
                    admin.from_("face_embeddings")
                    .insert([{
                        "student_id": str(student_id),
                        "embedding_vector": embedding.tolist(),
                        "model_version": cls.MODEL_VERSION,
                        "quality_score": quality_score,
                        "sample_index": sample_index,
                        "is_active": True,
                    }])
                    .execute()
                )
                if cls._response_error(response):
                    code = cls._response_code(response)
                    if code == "23505":
                        raise HTTPException(status.HTTP_409_CONFLICT, "Duplicate face sample index.")
                    raise HTTPException(status.HTTP_502_BAD_GATEWAY, "A face sample could not be stored.")
                rows = getattr(response, "data", None)
                if isinstance(rows, list) and len(rows) > 0 and isinstance(rows[0], dict) and "id" in rows[0]:
                    inserted_ids.append(str(rows[0]["id"]))
                elif isinstance(rows, dict) and "id" in rows:
                    inserted_ids.append(str(rows["id"]))
                else:
                    raise HTTPException(status.HTTP_502_BAD_GATEWAY, "A face sample could not be stored.")
        except HTTPException as exc:
            cleanup_complete = cls._cleanup_inserted_embeddings(admin, student_id, inserted_ids)
            if exc.status_code == status.HTTP_409_CONFLICT:
                if cleanup_complete:
                    raise cls.api_error(status.HTTP_409_CONFLICT, "EXISTING_ENROLMENT", "Duplicate face sample index. Enrolment cleanup succeeded.") from exc
                raise cls.api_error(status.HTTP_409_CONFLICT, "INCOMPLETE_ENROLMENT_CLEANUP", "Duplicate face sample index. Partial enrolment cleanup is incomplete.") from exc
            if cleanup_complete:
                raise cls.api_error(
                    status.HTTP_502_BAD_GATEWAY,
                    "UNEXPECTED_BACKEND_ERROR",
                    "Face enrolment failed. Stored samples were cleaned up.",
                ) from exc
            raise cls.api_error(
                status.HTTP_502_BAD_GATEWAY,
                "INCOMPLETE_ENROLMENT_CLEANUP",
                "Face enrolment failed and cleanup is incomplete. Contact an administrator.",
            ) from exc
        except Exception as exc:
            cleaned = cls._cleanup_inserted_embeddings(admin, student_id, inserted_ids)
            if cleaned:
                raise cls.api_error(status.HTTP_502_BAD_GATEWAY, "UNEXPECTED_BACKEND_ERROR", "Face enrolment failed. Inserted-sample cleanup succeeded.") from exc
            raise cls.api_error(status.HTTP_502_BAD_GATEWAY, "INCOMPLETE_ENROLMENT_CLEANUP", "Face enrolment failed. Inserted-sample cleanup is incomplete.") from exc

        try:
            updated = (
                admin.from_("students")
                .update({"face_enrolled": True})
                .eq("id", str(student_id))
                .execute()
            )
            if cls._response_error(updated):
                cleanup_complete = cls._cleanup_inserted_embeddings(admin, student_id, inserted_ids)
                if cleanup_complete:
                    raise cls.api_error(
                        status.HTTP_502_BAD_GATEWAY,
                        "UNEXPECTED_BACKEND_ERROR",
                        "Enrolment status could not be updated. Stored samples were cleaned up.",
                    )
                raise cls.api_error(
                    status.HTTP_502_BAD_GATEWAY,
                    "INCOMPLETE_ENROLMENT_CLEANUP",
                    "Enrolment status could not be updated and cleanup is incomplete. Contact an administrator.",
                )
            if not cls._verify_student_face_enrolled(admin, student_id, True):
                cleanup_complete = cls._cleanup_inserted_embeddings(admin, student_id, inserted_ids)
                if cleanup_complete:
                    raise cls.api_error(
                        status.HTTP_502_BAD_GATEWAY,
                        "UNEXPECTED_BACKEND_ERROR",
                        "Enrolment status could not be verified. Stored samples were cleaned up.",
                    )
                raise cls.api_error(
                    status.HTTP_502_BAD_GATEWAY,
                    "INCOMPLETE_ENROLMENT_CLEANUP",
                    "Enrolment status could not be verified and cleanup is incomplete. Contact an administrator.",
                )
        except HTTPException:
            raise
        except Exception as exc:
            cleanup_complete = cls._cleanup_inserted_embeddings(admin, student_id, inserted_ids)
            if cleanup_complete:
                raise cls.api_error(
                    status.HTTP_502_BAD_GATEWAY,
                    "UNEXPECTED_BACKEND_ERROR",
                    "Enrolment status update failed. Stored samples were cleaned up.",
                ) from exc
            raise cls.api_error(
                status.HTTP_502_BAD_GATEWAY,
                "INCOMPLETE_ENROLMENT_CLEANUP",
                "Enrolment status update failed and cleanup is incomplete. Contact an administrator.",
            ) from exc

        return {
            "status": "enrolled",
            "samples_enrolled": len(inserted_ids),
            "face_enrolled": True,
        }

    @classmethod
    async def list_active_attendance_sessions(
        cls,
        student_id: UUID,
    ) -> List[Dict[str, Any]]:
        admin = cls._admin()
        try:
            student_response = (
                admin.from_("students")
                .select("id, class_id")
                .eq("id", str(student_id))
                .single()
                .execute()
            )
        except Exception as exc:
            if cls._find_error_code(exc) == "PGRST116":
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Student record not found.") from exc
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load student record.") from exc
        if cls._response_error(student_response) or not student_response.data:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Student record not found.")
        class_id = student_response.data.get("class_id")
        if not class_id:
            return []

        try:
            sessions = (
                admin.from_("attendance_sessions")
                .select(
                    "id, session_date, status, "
                    "assignment:faculty_subject_assignments("
                    "class_id, is_active, subject:subjects(code, name), class:classes(name))"
                )
                .eq("status", "active_scanning")
                .order("start_time", desc=True)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load active attendance sessions.") from exc
        if cls._response_error(sessions):
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load active attendance sessions.")

        matching = []
        for row in sessions.data or []:
            assignment = row.get("assignment") or {}
            if assignment.get("is_active") is True and str(assignment.get("class_id")) == str(class_id):
                matching.append((row, assignment))
        if not matching:
            return []

        session_ids = [str(row["id"]) for row, _ in matching]
        try:
            records = (
                admin.from_("attendance_records")
                .select("session_id, status, marked_at")
                .eq("student_id", str(student_id))
                .in_("session_id", session_ids)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load attendance status.") from exc
        if cls._response_error(records):
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load attendance status.")
        records_by_session = {
            str(row["session_id"]): row for row in (records.data or [])
        }

        response = []
        for row, assignment in matching:
            subject = assignment.get("subject") or {}
            class_row = assignment.get("class") or {}
            record = records_by_session.get(str(row["id"])) or {}
            response.append(
                ActiveStudentAttendanceSession(
                    id=row["id"],
                    session_date=row["session_date"],
                    status=row["status"],
                    subject_name=subject.get("name"),
                    subject_code=subject.get("code"),
                    class_name=class_row.get("name"),
                    attendance_status=record.get("status"),
                    marked_at=record.get("marked_at"),
                ).model_dump()
            )
        return response

    @classmethod
    async def list_attendance_history(
        cls,
        student_id: UUID,
        access_token: str,
    ) -> List[Dict[str, Any]]:
        user_client = get_supabase_user_client(access_token)
        if not user_client:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Authenticated database access is not configured.",
            )

        try:
            records = (
                user_client.from_("attendance_records")
                .select("session_id, status")
                .eq("student_id", str(student_id))
                .execute()
            )
        except Exception as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load attendance history.") from exc
        if cls._response_error(records):
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load attendance history.")

        record_rows = records.data or []
        if not isinstance(record_rows, list):
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Attendance history response is invalid.")
        record_statuses = {}
        for row in record_rows:
            if not isinstance(row, dict) or not row.get("session_id"):
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Attendance history response is invalid.")
            if row.get("status") not in {"present", "late", "absent", "excused"}:
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Attendance history response is invalid.")
            record_statuses[str(row["session_id"])] = row["status"]
        if not record_statuses:
            return []

        try:
            sessions = (
                user_client.from_("attendance_sessions")
                .select(
                    "id, session_date, status, "
                    "assignment:faculty_subject_assignments(subject:subjects(code, name))"
                )
                .in_("id", list(record_statuses))
                .eq("status", "completed")
                .order("session_date", desc=True)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load attendance history.") from exc
        if cls._response_error(sessions):
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load attendance history.")

        session_rows = sessions.data or []
        if not isinstance(session_rows, list):
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Attendance history response is invalid.")

        history = []
        for row in session_rows:
            if not isinstance(row, dict) or row.get("status") != "completed":
                continue
            session_id = row.get("id")
            session_date = row.get("session_date")
            if not session_id or not session_date:
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Attendance history response is invalid.")
            assignment = row.get("assignment") or {}
            subject = assignment.get("subject") or {}
            history.append(
                StudentAttendanceHistoryRecord(
                    session_id=session_id,
                    session_date=session_date,
                    subject_name=subject.get("name"),
                    subject_code=subject.get("code"),
                    status=record_statuses[str(session_id)],
                ).model_dump()
            )
        return history

    @classmethod
    async def verify_attendance(
        cls,
        student_id: UUID,
        session_id: UUID,
        image_bytes: bytes,
        access_token: str,
        face_service: FaceRecognitionService,
    ) -> Dict[str, Any]:
        if not image_bytes or len(image_bytes) > cls.MAX_IMAGE_BYTES:
            raise cls.api_error(
                status.HTTP_400_BAD_REQUEST,
                "INVALID_IMAGE_OR_FACE",
                "The camera frame is empty or exceeds the size limit.",
            )
        if len(settings.ATTENDANCE_ATTESTATION_SECRET.encode("utf-8")) < 32:
            raise cls.api_error(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "ATTENDANCE_NOT_CONFIGURED",
                "Attendance verification is not configured on the server.",
            )

        consent = await cls.get_consent(student_id)
        if not consent["active"]:
            raise cls.api_error(
                status.HTTP_403_FORBIDDEN,
                "MISSING_OR_REVOKED_CONSENT",
                "Active biometric consent is required for attendance verification.",
            )
        if not consent["face_enrolled"]:
            raise cls.api_error(
                status.HTTP_409_CONFLICT,
                "FACE_ENROLMENT_REQUIRED",
                "A complete, valid face enrolment is required before attendance verification.",
            )

        admin = cls._admin()
        try:
            student_response = (
                admin.from_("students")
                .select("id, class_id, face_enrolled")
                .eq("id", str(student_id))
                .single()
                .execute()
            )
        except Exception as exc:
            if cls._find_error_code(exc) == "PGRST116":
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Student record not found.") from exc
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load student record.") from exc
        if cls._response_error(student_response) or not student_response.data:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Student record not found.")
        student = student_response.data
        if not student.get("class_id") or not student.get("face_enrolled"):
            raise cls.api_error(
                status.HTTP_409_CONFLICT,
                "FACE_ENROLMENT_REQUIRED",
                "A complete, valid face enrolment is required before attendance verification.",
            )

        try:
            session_response = (
                admin.from_("attendance_sessions")
                .select(
                    "id, status, assignment:faculty_subject_assignments(class_id, is_active)"
                )
                .eq("id", str(session_id))
                .single()
                .execute()
            )
        except Exception as exc:
            if cls._find_error_code(exc) == "PGRST116":
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Attendance session not found.") from exc
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load attendance session.") from exc
        if cls._response_error(session_response) or not session_response.data:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Attendance session not found.")
        session = session_response.data
        if session.get("status") != "active_scanning":
            raise cls.api_error(
                status.HTTP_409_CONFLICT,
                "SESSION_NOT_ACTIVE",
                "This attendance session is not accepting verification.",
            )
        assignment = session.get("assignment") or {}
        if (
            assignment.get("is_active") is not True
            or str(assignment.get("class_id")) != str(student["class_id"])
        ):
            raise cls.api_error(
                status.HTTP_403_FORBIDDEN,
                "SESSION_CLASS_MISMATCH",
                "This attendance session is not available to your class.",
            )

        try:
            embeddings_response = (
                admin.from_("face_embeddings")
                .select(
                    "sample_index, is_active, model_version, quality_score, embedding_vector"
                )
                .eq("student_id", str(student_id))
                .execute()
            )
        except Exception as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load face enrolment.") from exc
        if cls._response_error(embeddings_response):
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load face enrolment.")
        embedding_rows = embeddings_response.data or []
        if not cls.has_complete_enrolment(True, embedding_rows):
            raise cls.api_error(
                status.HTTP_409_CONFLICT,
                "FACE_ENROLMENT_REQUIRED",
                "A complete, valid face enrolment is required before attendance verification.",
            )

        try:
            live = face_service.extract_embedding(image_bytes)
        except Exception as exc:
            raise cls.api_error(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "FACE_PROCESSING_UNAVAILABLE",
                "Face processing is temporarily unavailable.",
            ) from exc
        if not isinstance(live, dict) or live.get("status") != "success":
            reason = live.get("status") if isinstance(live, dict) else None
            if reason == "model_error":
                raise cls.api_error(
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                    "FACE_PROCESSING_UNAVAILABLE",
                    "Face processing is temporarily unavailable.",
                )
            messages = {
                "invalid_image": "The captured frame is not a valid image.",
                "no_face": "No face was detected. Center your face and try again.",
                "multiple_faces": "More than one face was detected. Only one person may be in frame.",
                "poor_quality": "The face image is too small, blurry, or poorly lit.",
            }
            raise cls.api_error(
                status.HTTP_400_BAD_REQUEST,
                "INVALID_IMAGE_OR_FACE",
                messages.get(reason, "The captured face could not be verified."),
            )

        live_embedding = live.get("embedding")
        if not isinstance(live_embedding, np.ndarray):
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Face processing returned an invalid result.")
        similarities = []
        for row in embedding_rows:
            vector = row["embedding_vector"]
            if isinstance(vector, str):
                vector = np.fromstring(vector.strip().strip("[]"), sep=",", dtype=np.float32)
            else:
                vector = np.asarray(vector, dtype=np.float32)
            if vector.shape != (128,) or not np.all(np.isfinite(vector)):
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Stored face enrolment is invalid.")
            comparison = face_service.compare_embeddings(live_embedding, vector)
            if comparison.get("status") != "success":
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Face comparison could not be completed.")
            similarities.append(float(comparison["similarity"]))

        best_similarity = max(similarities)
        classification = face_service.classify_similarity(best_similarity)
        if classification.get("classification") != "matched":
            raise cls.api_error(
                status.HTTP_403_FORBIDDEN,
                "FACE_NOT_MATCHED",
                "The captured face could not be confidently matched. Try again with a clear, well-lit frame.",
            )

        attestation = issue_attestation(
            student_id,
            session_id,
            settings.ATTENDANCE_ATTESTATION_SECRET,
        )
        user_client = get_supabase_user_client(access_token)
        if not user_client:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Authenticated database access is not configured.",
            )
        try:
            rpc_response = user_client.rpc(
                "fn_record_verified_attendance",
                attestation.rpc_arguments(),
            ).execute()
        except Exception as exc:
            error_code = cls._find_error_code(exc)
            if error_code == "PT409":
                raise cls.api_error(
                    status.HTTP_409_CONFLICT,
                    "ATTESTATION_REPLAYED",
                    "This attendance verification request has already been used. Capture a new frame.",
                ) from exc
            if error_code in ("PT401", "PT403"):
                raise cls.api_error(
                    status.HTTP_403_FORBIDDEN,
                    "ATTENDANCE_VERIFICATION_REJECTED",
                    "The database rejected this attendance verification.",
                ) from exc
            if error_code == "PT503":
                raise cls.api_error(
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                    "ATTENDANCE_NOT_CONFIGURED",
                    "Attendance verification is not configured on the server.",
                ) from exc
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "Attendance could not be recorded.",
            ) from exc
        if cls._response_error(rpc_response):
            error_code = cls._response_code(rpc_response)
            if error_code == "PT409":
                raise cls.api_error(
                    status.HTTP_409_CONFLICT,
                    "ATTESTATION_REPLAYED",
                    "This attendance verification request has already been used. Capture a new frame.",
                )
            if error_code in ("PT401", "PT403"):
                raise cls.api_error(
                    status.HTTP_403_FORBIDDEN,
                    "ATTENDANCE_VERIFICATION_REJECTED",
                    "The database rejected this attendance verification.",
                )
            if error_code == "PT503":
                raise cls.api_error(
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                    "ATTENDANCE_NOT_CONFIGURED",
                    "Attendance verification is not configured on the server.",
                )
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Attendance could not be recorded.")

        result = rpc_response.data
        if isinstance(result, list) and len(result) == 1:
            result = result[0]
        if not isinstance(result, dict) or result.get("status") not in ("recorded", "already_recorded"):
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Attendance service returned an invalid response.")
        attendance_status = result.get("attendance_status")
        if attendance_status not in ("present", "late", "absent", "excused"):
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Attendance service returned an invalid response.")
        return StudentAttendanceVerificationResponse(
            status=result["status"],
            session_id=session_id,
            attendance_status=attendance_status,
        ).model_dump()

    @staticmethod
    def _cleanup_inserted_embeddings(admin: Any, student_id: UUID, inserted_ids: List[str]) -> bool:
        cleaned = True
        for embedding_id in inserted_ids:
            try:
                response = (
                    admin.from_("face_embeddings")
                    .delete()
                    .eq("id", embedding_id)
                    .execute()
                )
                if StudentBiometricService._response_error(response):
                    cleaned = False
            except Exception:
                cleaned = False
        if inserted_ids:
            cleaned = (
                StudentBiometricService._verify_inserted_embeddings_deleted(admin, inserted_ids)
                and cleaned
            )
        try:
            response = (
                admin.from_("students")
                .update({"face_enrolled": False})
                .eq("id", str(student_id))
                .execute()
            )
            if StudentBiometricService._response_error(response):
                cleaned = False
        except Exception:
            cleaned = False
        if not StudentBiometricService._verify_student_face_enrolled(admin, student_id, False):
            cleaned = False
        return cleaned

from dataclasses import replace
import secrets
from types import SimpleNamespace
from uuid import uuid4

import numpy as np
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.security import get_current_student_user
from app.main import app
from app.services.attendance_attestation import issue_attestation, verify_attestation
from app.services.student_biometric_service import StudentBiometricService


SECRET = secrets.token_urlsafe(48)
STUDENT_ID = uuid4()
OTHER_STUDENT_ID = uuid4()
SESSION_ID = uuid4()
OTHER_SESSION_ID = uuid4()
CLASS_ID = uuid4()
OTHER_CLASS_ID = uuid4()
EMBEDDING = (np.ones(128, dtype=np.float32) / np.sqrt(128)).tolist()


class FakeQuery:
    def __init__(self, table, database):
        self.table = table
        self.database = database
        self.filters = {}
        self.single_row = False

    def select(self, *args, **kwargs):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def single(self):
        self.single_row = True
        return self

    def in_(self, key, values):
        self.filters[key] = values
        return self

    def order(self, *args, **kwargs):
        return self

    def execute(self):
        if self.table == "students":
            data = {
                "id": str(STUDENT_ID),
                "class_id": str(self.database["class_id"]),
                "face_enrolled": True,
            }
        elif self.table == "attendance_sessions":
            data = {
                "id": str(SESSION_ID),
                "status": self.database["session_status"],
                "assignment": {
                    "class_id": str(self.database["session_class_id"]),
                    "is_active": True,
                },
            }
        elif self.table == "face_embeddings":
            data = self.database["embeddings"]
        else:
            raise AssertionError(f"Unexpected table: {self.table}")
        return SimpleNamespace(data=data, error=None)


class FakeAdmin:
    def __init__(self, database):
        self.database = database

    def from_(self, table):
        return FakeQuery(table, self.database)


class FakeFaceService:
    def __init__(self, status_value="success", similarity=0.8):
        self.status_value = status_value
        self.similarity = similarity
        self.extract_calls = 0

    def extract_embedding(self, image):
        self.extract_calls += 1
        if self.status_value != "success":
            return {"status": self.status_value}
        return {"status": "success", "embedding": np.asarray(EMBEDDING, dtype=np.float32)}

    def compare_embeddings(self, live, enrolled):
        return {"status": "success", "similarity": self.similarity}

    def classify_similarity(self, similarity):
        classification = (
            "matched" if similarity >= 0.363 else
            "uncertain" if similarity >= 0.300 else
            "unknown"
        )
        return {"status": "success", "classification": classification}


class FakeRpc:
    def __init__(self, response):
        self.response = response
        self.name = None
        self.arguments = None

    def rpc(self, name, arguments):
        self.name = name
        self.arguments = arguments
        return self

    def execute(self):
        return self.response


def valid_embeddings():
    return [
        {
            "sample_index": index,
            "is_active": True,
            "model_version": "sface_2021dec",
            "quality_score": 0.95,
            "embedding_vector": EMBEDDING,
        }
        for index in range(1, 6)
    ]


def configure_service(monkeypatch, *, session_status="active_scanning", session_class_id=None, class_id=None, embeddings=None, consent_active=True, rpc_response=None, face_service=None):
    database = {
        "session_status": session_status,
        "session_class_id": session_class_id or CLASS_ID,
        "class_id": class_id or CLASS_ID,
        "embeddings": valid_embeddings() if embeddings is None else embeddings,
    }
    admin = FakeAdmin(database)
    rpc = FakeRpc(
        rpc_response
        or SimpleNamespace(
            data={
                "status": "recorded",
                "session_id": str(SESSION_ID),
                "attendance_status": "present",
            },
            error=None,
        )
    )
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))
    async def get_consent(cls, student_id):
        return {
            "active": consent_active,
            "face_enrolled": True,
        }

    monkeypatch.setattr(StudentBiometricService, "get_consent", classmethod(get_consent))
    def get_user_client(token):
        rpc.authenticated_token = token
        return rpc

    monkeypatch.setattr("app.services.student_biometric_service.get_supabase_user_client", get_user_client)
    monkeypatch.setattr(
        "app.services.student_biometric_service.settings.ATTENDANCE_ATTESTATION_SECRET",
        SECRET,
    )
    return rpc, face_service or FakeFaceService()


def test_attestation_signature_binds_identity_session_time_and_nonce():
    attestation = issue_attestation(STUDENT_ID, SESSION_ID, SECRET, now_ms=1_000_000)
    assert verify_attestation(attestation, SECRET, now_ms=1_001_000)
    assert not verify_attestation(replace(attestation, signature="0" * 64), SECRET, now_ms=1_001_000)
    assert not verify_attestation(replace(attestation, student_id=OTHER_STUDENT_ID), SECRET, now_ms=1_001_000)
    assert not verify_attestation(replace(attestation, session_id=OTHER_SESSION_ID), SECRET, now_ms=1_001_000)
    assert not verify_attestation(replace(attestation, nonce=uuid4()), SECRET, now_ms=1_001_000)
    assert not verify_attestation(attestation, SECRET, now_ms=1_060_000)


@pytest.mark.asyncio
async def test_empty_frame_is_rejected_before_database_or_model(monkeypatch):
    _, face = configure_service(monkeypatch)
    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.verify_attendance(
            STUDENT_ID, SESSION_ID, b"", "user-token", face
        )
    assert exc.value.status_code == 400
    assert face.extract_calls == 0


@pytest.mark.asyncio
async def test_active_consent_is_required_before_face_processing(monkeypatch):
    _, face = configure_service(monkeypatch, consent_active=False)
    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.verify_attendance(
            STUDENT_ID, SESSION_ID, b"frame", "user-token", face
        )
    assert exc.value.status_code == 403
    assert face.extract_calls == 0


@pytest.mark.asyncio
async def test_missing_stored_embeddings_rejects_verification(monkeypatch):
    _, face = configure_service(monkeypatch, embeddings=[])
    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.verify_attendance(
            STUDENT_ID, SESSION_ID, b"frame", "user-token", face
        )
    assert exc.value.status_code == 409
    assert face.extract_calls == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("face_status", ["invalid_image", "no_face", "multiple_faces", "poor_quality"])
async def test_invalid_face_capture_is_rejected_without_rpc(monkeypatch, face_status):
    rpc, face = configure_service(monkeypatch, face_service=FakeFaceService(face_status))
    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.verify_attendance(
            STUDENT_ID, SESSION_ID, b"frame", "user-token", face
        )
    assert exc.value.status_code == 400
    assert rpc.name is None


@pytest.mark.asyncio
async def test_inactive_session_is_rejected_before_face_processing(monkeypatch):
    _, face = configure_service(monkeypatch, session_status="review_pending")
    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.verify_attendance(
            STUDENT_ID, SESSION_ID, b"frame", "user-token", face
        )
    assert exc.value.status_code == 409
    assert face.extract_calls == 0


@pytest.mark.asyncio
async def test_wrong_class_session_is_rejected_before_face_processing(monkeypatch):
    _, face = configure_service(monkeypatch, session_class_id=OTHER_CLASS_ID)
    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.verify_attendance(
            STUDENT_ID, SESSION_ID, b"frame", "user-token", face
        )
    assert exc.value.status_code == 403
    assert face.extract_calls == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("similarity", [0.32, 0.1])
async def test_uncertain_and_nonmatching_faces_do_not_reach_database(monkeypatch, similarity):
    rpc, face = configure_service(monkeypatch, face_service=FakeFaceService(similarity=similarity))
    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.verify_attendance(
            STUDENT_ID, SESSION_ID, b"frame", "user-token", face
        )
    assert exc.value.status_code == 403
    assert rpc.name is None


@pytest.mark.asyncio
async def test_successful_match_uses_user_scoped_rpc_and_hides_attestation(monkeypatch):
    rpc, face = configure_service(monkeypatch)
    result = await StudentBiometricService.verify_attendance(
        STUDENT_ID, SESSION_ID, b"frame", "user-token", face
    )
    assert result == {
        "status": "recorded",
        "session_id": SESSION_ID,
        "attendance_status": "present",
    }
    assert rpc.name == "fn_record_verified_attendance"
    assert rpc.authenticated_token == "user-token"
    assert rpc.arguments["p_student_id"] == str(STUDENT_ID)
    assert rpc.arguments["p_session_id"] == str(SESSION_ID)
    assert len(rpc.arguments["p_signature"]) == 64
    assert "signature" not in result
    assert "confidence_score" not in result


@pytest.mark.asyncio
async def test_duplicate_attendance_is_reported_from_persisted_rpc_result(monkeypatch):
    response = SimpleNamespace(
        data={
            "status": "already_recorded",
            "session_id": str(SESSION_ID),
            "attendance_status": "present",
        },
        error=None,
    )
    configure_service(monkeypatch, rpc_response=response)
    result = await StudentBiometricService.verify_attendance(
        STUDENT_ID, SESSION_ID, b"frame", "user-token", FakeFaceService()
    )
    assert result["status"] == "already_recorded"


@pytest.mark.asyncio
async def test_rpc_replay_rejection_is_reported_without_claiming_success(monkeypatch):
    response = SimpleNamespace(
        data=None,
        error=SimpleNamespace(code="PT409", message="already used"),
    )
    configure_service(monkeypatch, rpc_response=response)
    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.verify_attendance(
            STUDENT_ID, SESSION_ID, b"frame", "user-token", FakeFaceService()
        )
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "ATTESTATION_REPLAYED"


@pytest.mark.asyncio
async def test_database_rejects_invalid_or_expired_attestation(monkeypatch):
    response = SimpleNamespace(
        data=None,
        error=SimpleNamespace(code="PT401", message="attestation invalid or expired"),
    )
    configure_service(monkeypatch, rpc_response=response)
    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.verify_attendance(
            STUDENT_ID, SESSION_ID, b"frame", "user-token", FakeFaceService()
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_database_write_failure_is_not_reported_as_success(monkeypatch):
    response = SimpleNamespace(
        data=None,
        error=SimpleNamespace(code="40001", message="transaction serialization failure"),
    )
    configure_service(monkeypatch, rpc_response=response)
    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.verify_attendance(
            STUDENT_ID, SESSION_ID, b"frame", "user-token", FakeFaceService()
        )
    assert exc.value.status_code == 502


def test_student_route_uses_jwt_identity_and_ignores_submitted_student_id(monkeypatch):
    student_id = uuid4()
    other_student_id = uuid4()
    captured = {}

    async def fake_verify_attendance(**kwargs):
        captured.update(kwargs)
        return {
            "status": "recorded",
            "session_id": str(SESSION_ID),
            "attendance_status": "present",
        }

    monkeypatch.setattr(StudentBiometricService, "verify_attendance", fake_verify_attendance)
    app.dependency_overrides[get_current_student_user] = lambda: {
        "id": str(student_id),
        "access_token": "student-scoped-test-token",
    }
    try:
        response = TestClient(app).post(
            f"/api/v1/student/attendance/sessions/{SESSION_ID}/verify",
            files={"frame": ("frame.jpg", b"frame", "image/jpeg")},
            data={"student_id": str(other_student_id)},
        )
    finally:
        app.dependency_overrides.pop(get_current_student_user, None)

    assert response.status_code == 200
    assert str(captured["student_id"]) == str(student_id)
    assert captured["access_token"] == "student-scoped-test-token"


def test_non_student_cannot_invoke_attendance_verification(authenticate_as):
    with authenticate_as("faculty"):
        response = TestClient(app).post(
            f"/api/v1/student/attendance/sessions/{SESSION_ID}/verify",
            files={"frame": ("frame.jpg", b"frame", "image/jpeg")},
        )
    assert response.status_code == 403

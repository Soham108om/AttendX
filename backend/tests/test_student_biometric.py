from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import numpy as np
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.services.student_biometric_service import StudentBiometricService


client = TestClient(app)
ENROLMENT_SAMPLES = [b"sample-image"] * StudentBiometricService.REQUIRED_SAMPLES


class FakeQuery:
    def __init__(self, execute_result=None):
        self.result = execute_result or SimpleNamespace(data=None, error=None)
        self.is_maybe_single = False

    def select(self, *args, **kwargs):
        return self

    def eq(self, *args, **kwargs):
        return self

    def maybe_single(self):
        self.is_maybe_single = True
        return self

    def single(self):
        return self

    def update(self, *args, **kwargs):
        return self

    def insert(self, *args, **kwargs):
        return self

    def delete(self, *args, **kwargs):
        return self

    def execute(self):
        if (
            self.is_maybe_single
            and getattr(self.result, "data", None) is None
            and not getattr(self.result, "error", None)
        ):
            return None
        return self.result


class FakeAdmin:
    def __init__(self, tables):
        self.tables = tables

    def from_(self, table):
        return self.tables[table]


class FakeFaceService:
    def __init__(self, result=None):
        self.result = result or {
            "status": "success",
            "embedding": np.ones(128, dtype=np.float32) / np.sqrt(128),
            "quality_score": 0.99,
        }
        self.calls = 0

    def extract_embedding(self, image):
        self.calls += 1
        return self.result


def test_missing_authentication():
    consent = client.get("/api/v1/student/consent")
    enrol = client.post("/api/v1/student/face-enrolment")
    assert consent.status_code == 401
    assert enrol.status_code in (401, 422)


def test_student_routes_are_registered_once():
    from app.api.router import api_router

    student_routes = [
        (route.path, tuple(sorted(getattr(route, "methods", ()))))
        for route in api_router.routes
        if getattr(route, "path", "").startswith("/student/")
    ]
    assert len(student_routes) == len(set(student_routes))


@pytest.mark.asyncio
async def test_get_consent_maybe_single_zero_rows(monkeypatch):
    student_id = uuid4()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data=None, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(data=None, error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    result = await StudentBiometricService.get_consent(student_id)
    assert result["consent_given"] is False
    assert result["active"] is False
    assert result["enrolment_state"] == "consent_not_given"


@pytest.mark.asyncio
async def test_get_consent_database_error_is_not_treated_as_missing(monkeypatch):
    student_id = uuid4()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data=None, error=SimpleNamespace(code="PGRST"))),
        "face_embeddings": FakeQuery(SimpleNamespace(data=None, error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.get_consent(student_id)

    assert exc.value.status_code == 502


def test_non_student_caller(authenticate_as):
    with authenticate_as("faculty"):
        result = client.get("/api/v1/student/consent")
    assert result.status_code == 403


@pytest.mark.asyncio
async def test_student_identity_must_match_verified_record(monkeypatch):
    student_id = uuid4()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data=None, error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.verify_student(student_id)

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_missing_consent_blocks_enrolment(monkeypatch):
    student_id = uuid4()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data=None, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(data=None, error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.enrol(student_id, [b"image"], FakeFaceService())

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_revoked_consent_blocks_enrolment(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": False,
            "consent_timestamp": now,
            "revoked_at": now,
        }, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(data=None, error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.enrol(student_id, [b"image"], FakeFaceService())

    assert exc.value.status_code == 403


def test_invalid_ip_address():
    class Request:
        client = SimpleNamespace(host="not-an-ip")

    with pytest.raises(HTTPException) as exc:
        StudentBiometricService.derive_ip(Request())

    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_oversized_face_sample(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": True,
            "consent_timestamp": now,
            "revoked_at": None,
        }, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(data=None, error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.enrol(
            student_id,
            [b"sample-image"] * 4 + [b"x" * (StudentBiometricService.MAX_IMAGE_BYTES + 1)],
            FakeFaceService(),
        )

    assert exc.value.status_code == 400


@pytest.mark.asyncio
@pytest.mark.parametrize("sample_count", [4, 6])
async def test_enrolment_requires_exactly_five_samples(monkeypatch, sample_count):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": True,
            "consent_timestamp": now,
            "revoked_at": None,
        }, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(data=None, error=None)),
    })
    face_service = FakeFaceService()
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.enrol(
            student_id,
            [b"sample-image"] * sample_count,
            face_service,
        )

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "INVALID_IMAGE_OR_FACE"
    assert face_service.calls == 0


@pytest.mark.asyncio
async def test_successful_consent_creation(monkeypatch):
    student_id = uuid4()
    timestamp = datetime.now(timezone.utc).isoformat()

    student_query = FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None))
    existing_query = FakeQuery(SimpleNamespace(data=None, error=None))
    insert_query = FakeQuery(SimpleNamespace(data={
        "consent_timestamp": timestamp,
        "revoked_at": None,
    }, error=None))
    admin = FakeAdmin({
        "students": student_query,
        "biometric_consents": existing_query,
    })

    consent_table_calls = iter([existing_query, insert_query])
    admin.from_ = lambda table: consent_table_calls.__next__() if table == "biometric_consents" else student_query
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    result = await StudentBiometricService.give_consent(
        student_id,
        "127.0.0.1",
        "test-agent",
    )
    assert result["status"] == "consent_recorded"
    assert result["active"] is True


@pytest.mark.asyncio
async def test_existing_consent_reactivation(monkeypatch):
    student_id = uuid4()
    timestamp = datetime.now(timezone.utc).isoformat()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={"id": str(uuid4())}, error=None)),
    })
    update_result = SimpleNamespace(data={"consent_timestamp": timestamp, "revoked_at": None}, error=None)
    original_from = admin.from_

    class ReactivateQuery(FakeQuery):
        def update(self, *args, **kwargs):
            self.result = update_result
            return self

    reactivate = ReactivateQuery(SimpleNamespace(data={"id": str(uuid4())}, error=None))
    admin.from_ = lambda table: reactivate if table == "biometric_consents" else original_from(table)
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    result = await StudentBiometricService.give_consent(
        student_id,
        "127.0.0.1",
        "test-agent",
    )
    assert result["status"] == "consent_recorded"
    assert result["active"] is True


@pytest.mark.asyncio
async def test_initial_consent_maybe_single_zero_rows(monkeypatch):
    student_id = uuid4()
    student = FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None))
    existing = FakeQuery(SimpleNamespace(data=None, error=None))
    inserted = FakeQuery(SimpleNamespace(data={
        "consent_timestamp": datetime.now(timezone.utc).isoformat(),
        "revoked_at": None,
    }, error=None))
    admin = FakeAdmin({
        "students": student,
        "biometric_consents": existing,
    })
    consent_calls = iter([existing, inserted])
    admin.from_ = lambda table: consent_calls.__next__() if table == "biometric_consents" else student
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    result = await StudentBiometricService.give_consent(
        student_id,
        "127.0.0.1",
        "test-agent",
    )
    assert result["status"] == "consent_recorded"
    assert result["active"] is True


@pytest.mark.asyncio
async def test_consent_api_error_is_not_empty_success(monkeypatch):
    student_id = uuid4()

    class ApiErrorQuery(FakeQuery):
        def execute(self):
            raise Exception("database unavailable")

    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": ApiErrorQuery(),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.give_consent(
            student_id,
            "127.0.0.1",
            "test-agent",
        )
    assert exc.value.status_code == 502


@pytest.mark.asyncio
async def test_invalid_embedding_dimension(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": True,
            "consent_timestamp": now,
            "revoked_at": None,
        }, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(data=None, error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.enrol(
            student_id,
            ENROLMENT_SAMPLES,
            FakeFaceService({
                "status": "success",
                "embedding": np.ones(127, dtype=np.float32),
                "quality_score": 0.99,
            }),
        )

    assert exc.value.status_code == 502
    assert exc.value.detail["code"] == "UNEXPECTED_BACKEND_ERROR"


@pytest.mark.asyncio
async def test_non_normalized_embedding(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": True,
            "consent_timestamp": now,
            "revoked_at": None,
        }, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(data=None, error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.enrol(
            student_id,
            ENROLMENT_SAMPLES,
            FakeFaceService({
                "status": "success",
                "embedding": np.ones(128, dtype=np.float32),
                "quality_score": 0.99,
            }),
        )

    assert exc.value.status_code == 502
    assert exc.value.detail["code"] == "UNEXPECTED_BACKEND_ERROR"


@pytest.mark.asyncio
async def test_face_service_rejections(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": True,
            "consent_timestamp": now,
            "revoked_at": None,
        }, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(data=None, error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    for service_status in ("invalid_image", "no_face", "multiple_faces", "poor_quality"):
        with pytest.raises(HTTPException) as exc:
            await StudentBiometricService.enrol(
                student_id,
                ENROLMENT_SAMPLES,
                FakeFaceService({"status": service_status}),
            )
        assert exc.value.status_code == 400
        assert exc.value.detail["code"] == "INVALID_IMAGE_OR_FACE"


@pytest.mark.asyncio
async def test_low_quality_embedding_is_rejected(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": True,
            "consent_timestamp": now,
            "revoked_at": None,
        }, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(data=None, error=None)),
    })
    face_service = FakeFaceService({
        "status": "success",
        "embedding": np.ones(128, dtype=np.float32) / np.sqrt(128),
        "quality_score": 0.89,
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.enrol(student_id, ENROLMENT_SAMPLES, face_service)

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "INVALID_IMAGE_OR_FACE"
    assert face_service.calls == 1


@pytest.mark.asyncio
async def test_face_model_error_is_not_reported_as_success(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": True,
            "consent_timestamp": now,
            "revoked_at": None,
        }, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(data=None, error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.enrol(
            student_id,
            ENROLMENT_SAMPLES,
            FakeFaceService({"status": "model_error"}),
        )

    assert exc.value.status_code == 503
    assert exc.value.detail["code"] == "UNEXPECTED_BACKEND_ERROR"


@pytest.mark.asyncio
async def test_duplicate_existing_samples(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": True,
            "consent_timestamp": now,
            "revoked_at": None,
        }, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(data=[{"sample_index": 1}], error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.enrol(student_id, ENROLMENT_SAMPLES, FakeFaceService())

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_successful_enrolment_does_not_return_embedding(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()

    class StudentQuery(FakeQuery):
        def __init__(self):
            super().__init__(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None))
            self.update_calls = 0

        def update(self, *args, **kwargs):
            self.update_calls += 1
            return self

        def execute(self):
            if self.update_calls:
                return SimpleNamespace(data={"id": str(student_id), "face_enrolled": True}, error=None)
            return self.result

    student = StudentQuery()
    consent = FakeQuery(SimpleNamespace(data={
        "consent_given": True,
        "consent_timestamp": now,
        "revoked_at": None,
    }, error=None))
    inserted_payloads = []
    face_embeddings = FakeQuery(SimpleNamespace(data=None, error=None))

    def insert_face_embedding(payload):
        inserted_payloads.extend(payload)
        return SimpleNamespace(
            execute=lambda: SimpleNamespace(
                data=[{"id": str(uuid4())}],
                error=None,
            )
        )
    face_embeddings.insert = insert_face_embedding
    face_embeddings.delete = lambda *args, **kwargs: face_embeddings
    admin = FakeAdmin({
        "students": student,
        "biometric_consents": consent,
        "face_embeddings": face_embeddings,
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    face_service = FakeFaceService()
    result = await StudentBiometricService.enrol(
        student_id,
        ENROLMENT_SAMPLES,
        face_service,
    )
    assert result["status"] == "enrolled"
    assert result["samples_enrolled"] == StudentBiometricService.REQUIRED_SAMPLES
    assert face_service.calls == StudentBiometricService.REQUIRED_SAMPLES
    assert student.update_calls == 1
    assert [row["sample_index"] for row in inserted_payloads] == [1, 2, 3, 4, 5]
    assert all(row["student_id"] == str(student_id) for row in inserted_payloads)
    assert "embedding" not in str(result).lower()


@pytest.mark.asyncio
async def test_storage_failure_is_not_reported_as_success(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()

    class FailingInsertQuery(FakeQuery):
        def __init__(self):
            super().__init__(SimpleNamespace(data=None, error=None))
            self.insert_count = 0

        def insert(self, payload):
            self.insert_count += 1
            return self

        def execute(self):
            if self.insert_count:
                return SimpleNamespace(
                    data=None,
                    error=SimpleNamespace(code="XX000", message="must not be exposed"),
                )
            return self.result

    face_embeddings = FailingInsertQuery()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": True,
            "consent_timestamp": now,
            "revoked_at": None,
        }, error=None)),
        "face_embeddings": face_embeddings,
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.enrol(student_id, ENROLMENT_SAMPLES, FakeFaceService())

    assert exc.value.status_code == 502
    assert exc.value.detail["code"] == "UNEXPECTED_BACKEND_ERROR"
    assert "must not be exposed" not in str(exc.value.detail)
    assert face_embeddings.insert_count == 1


@pytest.mark.asyncio
async def test_revoke_blocks_later_enrolment(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()

    revoked_consent = FakeQuery(SimpleNamespace(data={
        "consent_given": False,
        "consent_timestamp": now,
        "revoked_at": now,
    }, error=None))
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": revoked_consent,
        "face_embeddings": FakeQuery(SimpleNamespace(data=None, error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.enrol(student_id, [b"image"], FakeFaceService())

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_revocation_with_missing_consent_is_not_success(monkeypatch):
    student_id = uuid4()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data=None, error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.revoke_consent(student_id)

    assert exc.value.status_code == 502


@pytest.mark.asyncio
async def test_revocation_cleanup_failure_is_reported(monkeypatch):
    student_id = uuid4()
    class ConsentQuery(FakeQuery):
        def __init__(self):
            super().__init__(SimpleNamespace(data={"id": str(uuid4())}, error=None))
            self.update_calls = 0
            self.execute_calls = 0

        def update(self, *args, **kwargs):
            self.update_calls += 1
            return self

        def execute(self):
            self.execute_calls += 1
            if self.update_calls and self.execute_calls == 1:
                return SimpleNamespace(data={"id": str(uuid4())}, error=None)
            return SimpleNamespace(
                data={"consent_given": False, "revoked_at": datetime.now(timezone.utc).isoformat()},
                error=None,
            )

    consent = ConsentQuery()

    class FailingDeleteQuery(FakeQuery):
        def delete(self, *args, **kwargs):
            return self

        def execute(self):
            return SimpleNamespace(data=None, error=SimpleNamespace(code="PGRST", message="cleanup failed"))

    class StudentUpdateQuery(FakeQuery):
        def __init__(self):
            super().__init__(SimpleNamespace(data={"id": str(student_id), "face_enrolled": True}, error=None))
            self.update_calls = 0

        def update(self, *args, **kwargs):
            self.update_calls += 1
            return self

        def execute(self):
            if self.update_calls:
                return SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)
            return SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)

    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": True}, error=None)),
        "biometric_consents": consent,
        "face_embeddings": FailingDeleteQuery(),
    })
    admin.tables["students"] = StudentUpdateQuery()
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    result = await StudentBiometricService.revoke_consent(student_id)
    assert result["status"] == "partial_revocation"
    assert result["embeddings_deleted"] is False


def test_nested_postgrest_duplicate_error_is_normalized():
    response = SimpleNamespace(
        error={"details": {"error": {"sqlstate": "23505"}}},
        data=None,
    )
    assert StudentBiometricService._response_code(response) == "23505"


@pytest.mark.asyncio
async def test_status_enrolled_survives_refresh(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()
    vector = [1.0] + [0.0] * 127
    embeddings = [
        {
            "id": str(uuid4()),
            "sample_index": sample_index,
            "is_active": True,
            "model_version": StudentBiometricService.MODEL_VERSION,
            "quality_score": 0.95,
            "embedding_vector": vector,
        }
        for sample_index in range(1, StudentBiometricService.REQUIRED_SAMPLES + 1)
    ]
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": True}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": True,
            "consent_timestamp": now,
            "revoked_at": None,
        }, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(data=embeddings, error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    for _ in range(2):
        status_result = await StudentBiometricService.get_consent(student_id)
        assert status_result["enrolment_state"] == "face_enrolled"
        assert status_result["face_enrolled"] is True
        assert "embedding_vector" not in str(status_result)
        assert "id" not in str(status_result)


@pytest.mark.asyncio
async def test_status_inconsistent_existing_records(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": True,
            "consent_timestamp": now,
            "revoked_at": None,
        }, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(data=[{"id": str(uuid4()), "is_active": False}], error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    status_result = await StudentBiometricService.get_consent(student_id)
    assert status_result["enrolment_state"] == "blocked_existing_records"
    assert status_result["has_biometric_records"] is True


@pytest.mark.asyncio
async def test_status_flag_without_embedding_records_requires_review(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": True}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": True,
            "consent_timestamp": now,
            "revoked_at": None,
        }, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(data=None, error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    result = await StudentBiometricService.get_consent(student_id)

    assert result["face_enrolled"] is False
    assert result["has_biometric_records"] is False
    assert result["enrolment_state"] == "review_required"


@pytest.mark.asyncio
async def test_revoked_consent_status_reports_remaining_records(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": False,
            "consent_timestamp": now,
            "revoked_at": now,
        }, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(data=[{"id": str(uuid4()), "is_active": True}], error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    result = await StudentBiometricService.get_consent(student_id)

    assert result["active"] is False
    assert result["has_biometric_records"] is True
    assert result["enrolment_state"] == "consent_revoked"


@pytest.mark.asyncio
async def test_status_active_consent_not_enrolled(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": True,
            "consent_timestamp": now,
            "revoked_at": None,
        }, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(data=None, error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    status_result = await StudentBiometricService.get_consent(student_id)
    assert status_result["enrolment_state"] == "consent_active_face_not_enrolled"


def test_compensation_verifies_inserted_embedding_deletion():
    embedding_id = str(uuid4())
    student_id = uuid4()

    class DeleteVerifyQuery(FakeQuery):
        def __init__(self):
            super().__init__(SimpleNamespace(data=None, error=None))
            self.deleted = False

        def delete(self, *args, **kwargs):
            self.deleted = True
            return self

        def execute(self):
            if self.deleted:
                return SimpleNamespace(data=[{"id": embedding_id}], error=SimpleNamespace(code="PGRST", message="delete failed"))
            return SimpleNamespace(data=None, error=None)

    class StudentQuery(FakeQuery):
        def update(self, *args, **kwargs):
            return self

        def execute(self):
            return SimpleNamespace(data={"face_enrolled": False}, error=None)

    admin = FakeAdmin({
        "face_embeddings": DeleteVerifyQuery(),
        "students": StudentQuery(),
    })

    cleaned = StudentBiometricService._cleanup_inserted_embeddings(
        admin,
        student_id,
        [embedding_id],
    )
    assert cleaned is False


@pytest.mark.asyncio
async def test_final_face_enrolled_update_response_error_compensates(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()

    class StudentQuery(FakeQuery):
        def __init__(self):
            super().__init__(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None))
            self.update_calls = 0

        def update(self, *args, **kwargs):
            self.update_calls += 1
            return self

        def execute(self):
            if self.update_calls:
                return SimpleNamespace(data=None, error=SimpleNamespace(code="PGRST", message="update failed"))
            return SimpleNamespace(data={"face_enrolled": False}, error=None)

    class FaceQuery(FakeQuery):
        def insert(self, *args, **kwargs):
            return SimpleNamespace(
                execute=lambda: SimpleNamespace(
                    data=[{"id": str(uuid4())}],
                    error=None,
                )
            )

        def delete(self, *args, **kwargs):
            return self

        def execute(self):
            return SimpleNamespace(data=None, error=None)

    admin = FakeAdmin({
        "students": StudentQuery(),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": True,
            "consent_timestamp": now,
            "revoked_at": None,
        }, error=None)),
        "face_embeddings": FaceQuery(SimpleNamespace(data=None, error=None)),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.enrol(
            student_id,
            ENROLMENT_SAMPLES,
            FakeFaceService(),
        )

    assert exc.value.status_code == 502
    assert "cleanup" in exc.value.detail["message"].lower()
    assert exc.value.detail["code"] == "INCOMPLETE_ENROLMENT_CLEANUP"


@pytest.mark.asyncio
async def test_inactive_embedding_record_is_not_deleted(monkeypatch):
    student_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()
    admin = FakeAdmin({
        "students": FakeQuery(SimpleNamespace(data={"id": str(student_id), "face_enrolled": False}, error=None)),
        "biometric_consents": FakeQuery(SimpleNamespace(data={
            "consent_given": True,
            "consent_timestamp": now,
            "revoked_at": None,
        }, error=None)),
        "face_embeddings": FakeQuery(SimpleNamespace(
            data=[{"sample_index": 1, "is_active": False}],
            error=None,
        )),
    })
    monkeypatch.setattr(StudentBiometricService, "_admin", staticmethod(lambda: admin))

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.enrol(student_id, ENROLMENT_SAMPLES, FakeFaceService())

    assert exc.value.status_code == 409

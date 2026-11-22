import json
import pytest
import httpx
from types import SimpleNamespace
from fastapi.testclient import TestClient
from supabase import create_client, ClientOptions
from app.main import app
from app.services.provisioning_service import ProvisioningService, generate_secure_password
from app.schemas.provisioning import (
    AssignmentCreateRequest,
    FacultyResponse,
    StudentResponse,
    AssignmentResponse,
)
from uuid import uuid4
from fastapi import HTTPException
from postgrest.exceptions import APIError
from app.services.faculty_service import FacultyService
from app.schemas.faculty import (
    AttendanceSessionResponse,
    SessionCreateRequest,
)
import app.services.faculty_service as faculty_module

client = TestClient(app)


def test_secure_password_generator():
    """Verify that generated passwords meet institutional complexity requirements."""
    pwd = generate_secure_password(14)
    assert len(pwd) == 14
    assert any(c.isupper() for c in pwd)
    assert any(c.islower() for c in pwd)
    assert any(c.isdigit() for c in pwd)
    assert any(c in "!@#$%^&*" for c in pwd)


def test_admin_endpoint_requires_auth():
    """Unauthenticated requests without Bearer token must return 401."""
    res_fac = client.get("/api/v1/admin/faculty")
    assert res_fac.status_code == 401

    res_stu = client.get("/api/v1/admin/students")
    assert res_stu.status_code == 401

    res_asg = client.get("/api/v1/admin/assignments")
    assert res_asg.status_code == 401


def test_faculty_cannot_create_accounts(authenticate_as):
    """Faculty tokens must be rejected with 403 Forbidden on administrative endpoints."""
    payload = {
        "email": "faculty2@univ.edu",
        "full_name": "Faculty User",
        "faculty_id_number": "FAC002",
        "department_id": "00000000-0000-0000-0000-000000000001",
        "designation": "Assistant Professor",
    }
    with authenticate_as("faculty"):
        res = client.post("/api/v1/admin/provision/faculty", json=payload)
    assert res.status_code == 403
    assert "Administrative privileges required" in res.json()["detail"]


def test_student_cannot_create_accounts(authenticate_as):
    """Student tokens must be rejected with 403 Forbidden on administrative endpoints."""
    payload = {
        "email": "student2@univ.edu",
        "full_name": "Student User",
        "registration_number": "REG002",
        "roll_number": "21CS099",
        "class_id": "00000000-0000-0000-0000-000000000001",
    }
    with authenticate_as("student"):
        res = client.post("/api/v1/admin/provision/student", json=payload)
    assert res.status_code == 403
    assert "Administrative privileges required" in res.json()["detail"]


def test_admin_provision_faculty_payload_validation(authenticate_as):
    """Invalid requests with malformed email or missing fields must fail with 422."""
    # Malformed email
    bad_payload = {
        "email": "not-an-email",
        "full_name": "Test Faculty",
        "faculty_id_number": "FAC001",
        "department_id": "00000000-0000-0000-0000-000000000001",
        "designation": "Assistant Professor",
    }
    with authenticate_as("admin"):
        res = client.post("/api/v1/admin/provision/faculty", json=bad_payload)
    assert res.status_code == 422


def test_admin_provision_student_payload_validation(authenticate_as):
    """Invalid requests with short full_name or missing fields must fail with 422."""
    bad_payload = {
        "email": "student@univ.edu",
        "full_name": "S",  # Too short (min 2)
        "registration_number": "REG123",
        "roll_number": "R01",
        "class_id": "00000000-0000-0000-0000-000000000001",
    }
    with authenticate_as("admin"):
        res = client.post("/api/v1/admin/provision/student", json=bad_payload)
    assert res.status_code == 422


def test_admin_assignment_payload_validation(authenticate_as):
    """Invalid UUIDs in assignment payload must fail with 422."""
    bad_payload = {
        "faculty_id": "not-a-uuid",
        "subject_id": "00000000-0000-0000-0000-000000000001",
        "class_id": "00000000-0000-0000-0000-000000000001",
    }
    with authenticate_as("admin"):
        res = client.post("/api/v1/admin/assignments", json=bad_payload)
    assert res.status_code == 422


def _assignment_admin_with_insert_failure(insert_failure):
    class Query:
        def __init__(self, table):
            self.table = table

        def select(self, *args):
            return self

        def eq(self, *args):
            return self

        def insert(self, *args):
            class InsertBuilder:
                def execute(self):
                    if isinstance(insert_failure, Exception):
                        raise insert_failure
                    return insert_failure
            return InsertBuilder()

        def update(self, *args):
            class UpdateBuilder:
                def eq(self, *args):
                    return self
                def execute(self):
                    return SimpleNamespace(data=[{"id": str(uuid4()), "is_active": True}], error=None)
            return UpdateBuilder()

        def execute(self):
            if self.table == "faculty_subject_assignments":
                return SimpleNamespace(data=[], error=None)
            return SimpleNamespace(data=[{"id": str(uuid4())}], error=None)

    class FakeAdmin:
        def from_(self, table):
            return Query(table)

    return FakeAdmin()


def _assignment_request():
    return AssignmentCreateRequest(
        faculty_id=uuid4(),
        subject_id=uuid4(),
        class_id=uuid4(),
    )


@pytest.mark.asyncio
async def test_assignment_insert_unique_violation_logs_sanitized_fields_and_returns_409(
    monkeypatch, caplog
):
    class PostgrestFailure(Exception):
        code = "23505"
        message = (
            'duplicate key for private-record-value violates unique constraint '
            '"uq_faculty_subject_class"'
        )
        details = "private-record-details"

    monkeypatch.setattr(
        ProvisioningService,
        "_get_admin_client",
        staticmethod(lambda: _assignment_admin_with_insert_failure(PostgrestFailure())),
    )
    request = _assignment_request()

    with caplog.at_level("WARNING", logger="uvicorn.error"):
        with pytest.raises(HTTPException) as exc:
            await ProvisioningService.create_assignment(request)

    assert exc.value.status_code == 409
    assert exc.value.detail == "An assignment already exists for this faculty, subject, and class."
    assert (
        "operation=faculty_subject_class_assignment.insert "
        "sqlstate=23505 constraint=uq_faculty_subject_class "
        "error_type=PostgrestFailure"
    ) in caplog.text
    assert "private-record-value" not in caplog.text
    assert "private-record-details" not in caplog.text


@pytest.mark.asyncio
async def test_assignment_insert_other_sqlstate_logs_sanitized_fields_and_returns_400(
    monkeypatch, caplog
):
    class PostgrestFailure(Exception):
        code = "23503"
        message = (
            'insert for private-record-value violates foreign key constraint '
            '"faculty_subject_assignments_class_id_fkey"'
        )
        details = "private-record-details"

    monkeypatch.setattr(
        ProvisioningService,
        "_get_admin_client",
        staticmethod(lambda: _assignment_admin_with_insert_failure(PostgrestFailure())),
    )

    with caplog.at_level("WARNING", logger="uvicorn.error"):
        with pytest.raises(HTTPException) as exc:
            await ProvisioningService.create_assignment(_assignment_request())

    assert exc.value.status_code == 400
    assert exc.value.detail == "The faculty-subject-class assignment could not be created."
    assert (
        "operation=faculty_subject_class_assignment.insert "
        "sqlstate=23503 constraint=faculty_subject_assignments_class_id_fkey "
        "error_type=PostgrestFailure"
    ) in caplog.text
    assert "private-record-value" not in caplog.text
    assert "private-record-details" not in caplog.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("code", "message", "expected_sqlstate", "expected_constraint"),
    [
        ("bad-code", 'violates constraint "valid_constraint"', "null", "valid_constraint"),
        ("23503", 'violates constraint "invalid-name"', "23503", "null"),
        (None, None, "null", "null"),
    ],
)
async def test_assignment_insert_logs_null_for_invalid_or_missing_diagnostics(
    monkeypatch, caplog, code, message, expected_sqlstate, expected_constraint
):
    class PostgrestFailure(Exception):
        pass

    failure = PostgrestFailure("private-exception-text")
    failure.code = code
    failure.message = message
    failure.details = "private-record-details"
    monkeypatch.setattr(
        ProvisioningService,
        "_get_admin_client",
        staticmethod(lambda: _assignment_admin_with_insert_failure(failure)),
    )

    with caplog.at_level("WARNING", logger="uvicorn.error"):
        with pytest.raises(HTTPException) as exc:
            await ProvisioningService.create_assignment(_assignment_request())

    assert exc.value.status_code == 400
    assert (
        "operation=faculty_subject_class_assignment.insert "
        f"sqlstate={expected_sqlstate} constraint={expected_constraint} "
        "error_type=PostgrestFailure"
    ) in caplog.text
    assert "private-exception-text" not in caplog.text
    assert "private-record-details" not in caplog.text


@pytest.mark.asyncio
async def test_assignment_insert_response_error_is_logged_without_raw_details(
    monkeypatch, caplog
):
    failure = SimpleNamespace(
        code="23503",
        message='violates foreign key constraint "assignment_class_fkey"',
        details="private-record-details",
    )
    response = SimpleNamespace(data=None, error=failure)
    monkeypatch.setattr(
        ProvisioningService,
        "_get_admin_client",
        staticmethod(lambda: _assignment_admin_with_insert_failure(response)),
    )

    with caplog.at_level("WARNING", logger="uvicorn.error"):
        with pytest.raises(HTTPException) as exc:
            await ProvisioningService.create_assignment(_assignment_request())

    assert exc.value.status_code == 400
    assert exc.value.detail == "The faculty-subject-class assignment could not be created."
    assert (
        "operation=faculty_subject_class_assignment.insert "
        "sqlstate=23503 constraint=assignment_class_fkey error_type=null"
    ) in caplog.text
    assert "private-record-details" not in caplog.text


@pytest.mark.asyncio
async def test_successful_assignment_creation(monkeypatch):
    faculty_id = uuid4()
    subject_id = uuid4()
    class_id = uuid4()
    assignment_id = str(uuid4())

    created_payloads = []

    class Query:
        def __init__(self, table):
            self.table = table

        def select(self, *args):
            return self

        def eq(self, *args):
            return self

        def insert(self, rows):
            created_payloads.extend(rows)
            class InsertBuilder:
                def execute(self):
                    return SimpleNamespace(
                        data=[{
                            "id": assignment_id,
                            "faculty_id": str(faculty_id),
                            "subject_id": str(subject_id),
                            "class_id": str(class_id),
                            "is_active": True,
                        }],
                        error=None,
                    )
            return InsertBuilder()

        def execute(self):
            if self.table == "faculty_subject_assignments":
                # No existing duplicate
                return SimpleNamespace(data=[], error=None)
            # Relationship validation checks (faculty, subjects, classes)
            return SimpleNamespace(data=[{"id": str(uuid4())}], error=None)

    class FakeAdmin:
        def from_(self, table):
            return Query(table)

    monkeypatch.setattr(ProvisioningService, "_get_admin_client", classmethod(lambda cls: FakeAdmin()))

    req = AssignmentCreateRequest(
        faculty_id=faculty_id,
        subject_id=subject_id,
        class_id=class_id,
    )
    result = await ProvisioningService.create_assignment(req)

    assert result["status"] == "success"
    assert result["assignment"]["id"] == assignment_id
    assert result["assignment"]["is_active"] is True
    assert len(created_payloads) == 1
    assert created_payloads[0]["faculty_id"] == str(faculty_id)


@pytest.mark.asyncio
async def test_successful_assignment_reactivation(monkeypatch):
    faculty_id = uuid4()
    subject_id = uuid4()
    class_id = uuid4()
    existing_id = str(uuid4())

    update_called = []

    class Query:
        def __init__(self, table):
            self.table = table

        def select(self, *args):
            return self

        def eq(self, *args):
            return self

        def update(self, values):
            update_called.append(values)
            class UpdateBuilder:
                def eq(self, field, val):
                    return self
                def execute(self):
                    return SimpleNamespace(
                        data=[{"id": existing_id, "is_active": True}],
                        error=None,
                    )
            return UpdateBuilder()

        def execute(self):
            if self.table == "faculty_subject_assignments":
                # Existing inactive assignment
                return SimpleNamespace(data=[{"id": existing_id, "is_active": False}], error=None)
            return SimpleNamespace(data=[{"id": str(uuid4())}], error=None)

    class FakeAdmin:
        def from_(self, table):
            return Query(table)

    monkeypatch.setattr(ProvisioningService, "_get_admin_client", classmethod(lambda cls: FakeAdmin()))

    req = AssignmentCreateRequest(
        faculty_id=faculty_id,
        subject_id=subject_id,
        class_id=class_id,
    )
    result = await ProvisioningService.create_assignment(req)

    assert result["status"] == "success"
    assert result["assignment"]["id"] == existing_id
    assert result["assignment"]["is_active"] is True
    assert len(update_called) == 1
    assert update_called[0] == {"is_active": True}


@pytest.mark.asyncio
async def test_duplicate_active_assignment_raises_409(monkeypatch):
    faculty_id = uuid4()
    subject_id = uuid4()
    class_id = uuid4()

    class Query:
        def __init__(self, table):
            self.table = table

        def select(self, *args):
            return self

        def eq(self, *args):
            return self

        def execute(self):
            if self.table == "faculty_subject_assignments":
                return SimpleNamespace(data=[{"id": str(uuid4()), "is_active": True}], error=None)
            return SimpleNamespace(data=[{"id": str(uuid4())}], error=None)

    class FakeAdmin:
        def from_(self, table):
            return Query(table)

    monkeypatch.setattr(ProvisioningService, "_get_admin_client", classmethod(lambda cls: FakeAdmin()))

    req = AssignmentCreateRequest(
        faculty_id=faculty_id,
        subject_id=subject_id,
        class_id=class_id,
    )
    with pytest.raises(HTTPException) as exc:
        await ProvisioningService.create_assignment(req)

    assert exc.value.status_code == 409
    assert "already has an active assignment" in exc.value.detail


def test_auth_status_helper_returns_active_and_banned():
    class AuthAdmin:
        def __init__(self, banned_until=None):
            self.banned_until = banned_until

        def get_user_by_id(self, user_id):
            return SimpleNamespace(
                user=SimpleNamespace(banned_until=self.banned_until)
            )

    class FakeAdmin:
        def __init__(self, banned_until=None):
            self.auth = SimpleNamespace(admin=AuthAdmin(banned_until))

    assert ProvisioningService._auth_account_is_active(FakeAdmin(), str(uuid4())) is True
    assert ProvisioningService._auth_account_is_active(
        FakeAdmin("2099-01-01T00:00:00Z"), str(uuid4())
    ) is False


def test_auth_status_helper_distinguishes_lookup_failure():
    class FakeAdmin:
        class Auth:
            class Admin:
                def get_user_by_id(self, user_id):
                    raise Exception("Auth lookup unavailable")

            admin = Admin()

        auth = Auth()

    status_result = ProvisioningService._auth_account_status(FakeAdmin(), str(uuid4()))
    assert status_result == {"status": "unknown", "is_active": None}


def test_partial_provisioning_cleanup_attempts_database_and_auth():
    calls = []

    class Query:
        def select(self, *args):
            return self

        def delete(self):
            return self

        def eq(self, column, value):
            calls.append(("delete", column, value))
            return self

        def execute(self):
            return SimpleNamespace(data=None)

    class FromAdmin:
        def from_(self, table):
            calls.append(("table", table))
            return Query()

    class AuthAdmin:
        def delete_user(self, user_id):
            calls.append(("auth-delete", user_id))

        def get_user_by_id(self, user_id):
            return SimpleNamespace(user=None)

    fake_admin = FromAdmin()
    fake_admin.auth = SimpleNamespace(admin=AuthAdmin())

    cleaned = ProvisioningService._rollback_provisioning(
        fake_admin, "00000000-0000-0000-0000-000000000123", "faculty"
    )

    assert cleaned is True
    assert ("table", "faculty") in calls
    assert ("table", "profiles") in calls
    assert any(call[0] == "auth-delete" for call in calls)


def test_partial_provisioning_cleanup_reports_incomplete_cleanup():
    class Query:
        def delete(self):
            return self

        def eq(self, column, value):
            return self

        def execute(self):
            raise Exception("database cleanup failed")

    class FromAdmin:
        def from_(self, table):
            return Query()

    class AuthAdmin:
        def delete_user(self, user_id):
            raise Exception("auth cleanup failed")

    fake_admin = FromAdmin()
    fake_admin.auth = SimpleNamespace(admin=AuthAdmin())

    cleaned = ProvisioningService._rollback_provisioning(
        fake_admin, "00000000-0000-0000-0000-000000000123", "students"
    )

    assert cleaned is False


def test_partial_provisioning_cleanup_rejects_response_level_delete_error():
    class Query:
        def __init__(self):
            self.selecting = False

        def select(self, *args):
            self.selecting = True
            return self

        def delete(self):
            return self

        def eq(self, column, value):
            return self

        def execute(self):
            if self.selecting:
                return SimpleNamespace(data=[{"id": "remaining"}], error=None)
            return SimpleNamespace(
                data=None,
                error=SimpleNamespace(message="delete blocked", code="42501"),
            )

    class FromAdmin:
        def from_(self, table):
            return Query()

    class AuthAdmin:
        def delete_user(self, user_id):
            return None

        def get_user_by_id(self, user_id):
            return SimpleNamespace(user=None)

    fake_admin = FromAdmin()
    fake_admin.auth = SimpleNamespace(admin=AuthAdmin())

    cleaned = ProvisioningService._rollback_provisioning(
        fake_admin, "00000000-0000-0000-0000-000000000123", "faculty"
    )

    assert cleaned is False


def test_assignment_unique_violation_is_mapped():
    class UniqueViolation(Exception):
        code = "23505"

    assert ProvisioningService._postgres_error_code(UniqueViolation()) == "23505"


def test_faculty_dictionary_shaped_error_code_is_normalized():
    response = SimpleNamespace(
        error={"code": "23505", "message": "duplicate key"},
        data=None,
    )
    assert FacultyService._response_error_code(response) == "23505"


def test_faculty_nested_error_dictionary_is_normalized():
    response = SimpleNamespace(
        error={
            "details": {
                "error": {
                    "error_code": "PGRST116",
                }
            }
        },
        data=None,
    )
    assert FacultyService._response_error_code(response) == "PGRST116"


def test_faculty_exception_dictionary_nested_code_is_normalized():
    exception = SimpleNamespace(
        response={"details": {"error": {"code": "23505"}}}
    )
    assert FacultyService._exception_error_code(exception) == "23505"


def test_faculty_dictionary_infrastructure_error_is_not_duplicate():
    response = SimpleNamespace(
        error={"code": "PGRST302", "message": "JWT expired"},
        data=None,
    )
    assert FacultyService._response_error_code(response) == "PGRST302"


def test_faculty_student_assignment_response_contracts():
    faculty = FacultyResponse(
        id=uuid4(),
        email="faculty@univ.edu",
        full_name="Faculty User",
        faculty_id_number="FAC001",
        department_id=uuid4(),
        designation="Professor",
        is_active=True,
    )
    student = StudentResponse(
        id=uuid4(),
        email="student@univ.edu",
        full_name="Student User",
        registration_number="REG001",
        roll_number="R01",
        class_id=uuid4(),
        is_active=False,
    )
    assignment = AssignmentResponse(
        id=uuid4(),
        faculty_id=uuid4(),
        subject_id=uuid4(),
        class_id=uuid4(),
        is_active=True,
    )

    assert faculty.faculty_id_number == "FAC001"
    assert student.registration_number == "REG001"
    assert assignment.is_active is True


@pytest.mark.asyncio
async def test_student_list_requires_complete_persisted_embeddings(monkeypatch):
    enrolled_id = str(uuid4())
    incomplete_id = str(uuid4())
    pending_id = str(uuid4())
    valid_vector = [1.0] + [0.0] * 127
    students = [
        {
            "id": enrolled_id,
            "roll_number": "R01",
            "registration_number": "REG001",
            "face_enrolled": True,
            "class_id": str(uuid4()),
            "profile": {"full_name": "Enrolled Student", "email": "enrolled@example.edu"},
            "class": {"name": "CS-A", "department": {"code": "CS"}},
        },
        {
            "id": incomplete_id,
            "roll_number": "R02",
            "registration_number": "REG002",
            "face_enrolled": True,
            "class_id": str(uuid4()),
            "profile": {"full_name": "Incomplete Student", "email": "incomplete@example.edu"},
            "class": {"name": "CS-B", "department": {"code": "CS"}},
        },
        {
            "id": pending_id,
            "roll_number": "R03",
            "registration_number": "REG003",
            "face_enrolled": False,
            "class_id": str(uuid4()),
            "profile": {"full_name": "Pending Student", "email": "pending@example.edu"},
            "class": {"name": "CS-C", "department": {"code": "CS"}},
        },
    ]

    def embedding(student_id, sample_index, vector=valid_vector):
        return {
            "student_id": student_id,
            "sample_index": sample_index,
            "is_active": True,
            "model_version": "sface_2021dec",
            "quality_score": 0.95,
            "embedding_vector": vector,
        }

    embeddings = [
        embedding(enrolled_id, sample_index)
        for sample_index in range(1, 6)
    ] + [
        embedding(incomplete_id, sample_index, None if sample_index == 3 else valid_vector)
        for sample_index in range(1, 6)
    ]

    class Query:
        def __init__(self, table):
            self.table = table
            self.student_ids = None

        def select(self, *_args):
            return self

        def order(self, *_args, **_kwargs):
            return self

        def in_(self, _column, values):
            self.student_ids = set(values)
            return self

        def execute(self):
            if self.table == "students":
                return SimpleNamespace(data=students, error=None)
            return SimpleNamespace(
                data=[row for row in embeddings if row["student_id"] in self.student_ids],
                error=None,
            )

    class FakeAdmin:
        def from_(self, table):
            return Query(table)

    monkeypatch.setattr(ProvisioningService, "_get_admin_client", classmethod(lambda cls: FakeAdmin()))
    monkeypatch.setattr(
        ProvisioningService,
        "_auth_account_status",
        classmethod(lambda cls, _admin, _user_id: {"status": "active", "is_active": True}),
    )

    result = await ProvisioningService.get_students_list()
    by_id = {row["id"]: row for row in result}

    assert by_id[enrolled_id]["face_enrolled"] is True
    assert by_id[incomplete_id]["face_enrolled"] is False
    assert by_id[pending_id]["face_enrolled"] is False
    assert by_id[enrolled_id]["full_name"] == "Enrolled Student"
    assert by_id[enrolled_id]["roll_number"] == "R01"
    assert by_id[enrolled_id]["registration_number"] == "REG001"
    assert by_id[enrolled_id]["class_name"] == "CS-A"
    assert "embedding_vector" not in str(result)


@pytest.mark.asyncio
async def test_failed_faculty_auth_deactivation_is_not_reported_success(monkeypatch):
    class Query:
        def select(self, *args):
            return self

        def eq(self, *args):
            return self

        def execute(self):
            return SimpleNamespace(data=[{"id": "faculty-id"}])

    class FakeAdmin:
        def from_(self, table):
            return Query()

        def auth(self):
            raise AssertionError("auth must be an object")

    class FailingAuthAdmin:
        def update_user_by_id(self, user_id, payload):
            raise Exception("Auth ban failed")

    fake_admin = FakeAdmin()
    fake_admin.auth = SimpleNamespace(admin=FailingAuthAdmin())
    monkeypatch.setattr(ProvisioningService, "_get_admin_client", classmethod(lambda cls: fake_admin))

    with pytest.raises(HTTPException) as exc:
        await ProvisioningService.deactivate_faculty(
            uuid4()
        )

    assert exc.value.status_code == 502
    assert "No deactivation was applied" in exc.value.detail


def test_student_cannot_access_faculty_session_routes(authenticate_as):
    with authenticate_as("student"):
        assignment_res = client.get("/api/v1/faculty/assignments")
        session_res = client.get("/api/v1/faculty/sessions")
    assert assignment_res.status_code == 403
    assert session_res.status_code == 403


@pytest.mark.asyncio
async def test_invalid_session_transition_is_rejected(monkeypatch):
    session = AttendanceSessionResponse(
        id=uuid4(),
        assignment_id=uuid4(),
        created_by=uuid4(),
        session_date="2026-11-21",
        start_time="2026-11-21T10:00:00Z",
        status="scheduled",
        verification_method="webcam_face_recognition",
    )
    async def return_session(cls, faculty_id, session_id):
        return session

    monkeypatch.setattr(FacultyService, "get_session", classmethod(return_session))
    monkeypatch.setattr(
        FacultyService,
        "_admin",
        staticmethod(lambda: object()),
    )

    with pytest.raises(HTTPException) as exc:
        await FacultyService.transition_session(
            uuid4(),
            session.id,
            "review_pending",
        )

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_session_finalize_requires_ownership(monkeypatch):
    async def deny_session(cls, faculty_id, session_id):
        raise HTTPException(status_code=404, detail="Session not found or not owned by you.")

    monkeypatch.setattr(FacultyService, "get_session", classmethod(deny_session))

    with pytest.raises(HTTPException) as exc:
        await FacultyService.finalize_session(
            uuid4(),
            uuid4(),
            None,
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_successful_assignment_filtering(monkeypatch):
    class Query:
        def select(self, *args):
            return self

        def eq(self, *args):
            return self

        def order(self, *args, **kwargs):
            return self

        def execute(self):
            return SimpleNamespace(
                data=[{
                    "id": str(uuid4()),
                    "faculty_id": str(uuid4()),
                    "subject_id": str(uuid4()),
                    "class_id": str(uuid4()),
                    "is_active": True,
                    "subject": {
                        "code": "CS101",
                        "name": "Computer Science",
                        "department": {"code": "CSE", "name": "Computer Science"},
                        "department_id": str(uuid4()),
                    },
                    "class": {
                        "name": "CS-A",
                        "academic_year": "2026-2027",
                        "semester": 1,
                        "department_id": str(uuid4()),
                    },
                }],
                error=None,
            )

    class FakeAdmin:
        def from_(self, table):
            assert table == "faculty_subject_assignments"
            return Query()

    monkeypatch.setattr(FacultyService, "_admin", staticmethod(lambda: FakeAdmin()))
    faculty_id = uuid4()
    assignments = await FacultyService.get_assignments(faculty_id)

    assert len(assignments) == 1
    assert assignments[0].subject_code == "CS101"
    assert assignments[0].class_name == "CS-A"


@pytest.mark.asyncio
async def test_successful_session_creation(monkeypatch):
    faculty_id = uuid4()
    assignment_id = uuid4()
    session_id = uuid4()
    inserted_payloads = []
    assignment_filters = []

    class Query:
        def __init__(self, table):
            self.table = table

        def select(self, *args):
            return self

        def eq(self, *args):
            if self.table == "faculty_subject_assignments":
                assignment_filters.append(args)
            return self

        def in_(self, *args):
            return self

        def insert(self, payload):
            inserted_payloads.extend(payload)
            return SimpleNamespace(
                execute=lambda: SimpleNamespace(
                    data=[{
                        "id": str(session_id),
                        "assignment_id": str(assignment_id),
                        "created_by": str(faculty_id),
                        "session_date": "2026-11-21",
                        "start_time": "2026-11-21T10:00:00Z",
                        "status": "scheduled",
                        "verification_method": "webcam_face_recognition",
                        "notes": None,
                    }],
                    error=None,
                )
            )

        def single(self):
            return self

        def execute(self):
            if self.table == "faculty_subject_assignments":
                return SimpleNamespace(
                    data={
                        "id": str(assignment_id),
                        "faculty_id": str(faculty_id),
                        "subject_id": str(uuid4()),
                        "class_id": str(uuid4()),
                        "is_active": True,
                    },
                    error=None,
                )
            if self.table == "attendance_sessions":
                return SimpleNamespace(data=[], error=None)

            return SimpleNamespace(
                data={
                    "subject": {"code": "CS101", "name": "Computer Science"},
                    "class": {"name": "CS-A", "academic_year": "2026-2027", "department": {"code": "CSE"}},
                },
                error=None,
            )

        def __getattr__(self, name):
            if name == "inserted":
                return False
            raise AttributeError(name)

    class FakeAdmin:
        def from_(self, table):
            return Query(table)

    monkeypatch.setattr(FacultyService, "_admin", staticmethod(lambda: FakeAdmin()))
    # This test verifies response serialization; the service's conflict and insert
    # branches are exercised with a database-shaped fake in the focused suite.
    session = await FacultyService.create_session(
        faculty_id,
        SessionCreateRequest(assignment_id=assignment_id, session_date="2026-11-21"),
    )

    assert session.status == "scheduled"
    assert session.verification_method == "webcam_face_recognition"
    payload = inserted_payloads[0]
    assert payload["assignment_id"] == str(assignment_id)
    assert payload["session_date"] == "2026-11-21"
    assert payload["created_by"] == str(faculty_id)
    assert all(isinstance(payload[key], str) for key in ("assignment_id", "session_date", "created_by"))
    json.dumps(payload)
    assert ("id", str(assignment_id)) in assignment_filters
    assert ("faculty_id", str(faculty_id)) in assignment_filters
    assert ("is_active", True) in assignment_filters


@pytest.mark.asyncio
async def test_successful_session_transition_uses_update_result_rows(monkeypatch):
    faculty_id = uuid4()
    session_id = uuid4()
    assignment_id = uuid4()
    current_session = AttendanceSessionResponse(
        id=session_id,
        assignment_id=assignment_id,
        created_by=faculty_id,
        session_date="2026-11-21",
        start_time="2026-11-21T10:00:00Z",
        status="scheduled",
        verification_method="webcam_face_recognition",
    )
    updated_payloads = []
    updated_row = {
        "id": str(session_id),
        "assignment_id": str(assignment_id),
        "created_by": str(faculty_id),
        "session_date": "2026-11-21",
        "start_time": "2026-11-21T10:00:00Z",
        "status": "active_scanning",
        "verification_method": "webcam_face_recognition",
        "notes": None,
    }

    class UpdateBuilder:
        def eq(self, *args):
            return self

        def execute(self):
            return SimpleNamespace(data=[updated_row], error=None)

    class RelationQuery:
        def select(self, *args):
            return self

        def eq(self, *args):
            return self

        def single(self):
            return self

        def execute(self):
            return SimpleNamespace(
                data={
                    "subject": {"code": "CS101", "name": "Computer Science"},
                    "class": {
                        "name": "CS-A",
                        "academic_year": "2026-2027",
                        "department": {"code": "CSE"},
                    },
                },
                error=None,
            )

    class FakeAdmin:
        def from_(self, table):
            if table == "attendance_sessions":
                return SimpleNamespace(
                    update=lambda payload: (
                        updated_payloads.append(payload) or UpdateBuilder()
                    )
                )
            return RelationQuery()

    async def get_current_session(cls, owner_id, requested_session_id):
        assert owner_id == faculty_id
        assert requested_session_id == session_id
        return current_session

    monkeypatch.setattr(FacultyService, "_admin", staticmethod(lambda: FakeAdmin()))
    monkeypatch.setattr(FacultyService, "get_session", classmethod(get_current_session))

    updated = await FacultyService.transition_session(
        faculty_id,
        session_id,
        "active_scanning",
    )

    assert updated.status == "active_scanning"
    assert updated_payloads == [{"status": "active_scanning"}]


@pytest.mark.asyncio
async def test_duplicate_session_conflict(monkeypatch):
    faculty_id = uuid4()
    assignment_id = uuid4()

    class Query:
        def __init__(self, table):
            self.table = table

        def select(self, *args):
            return self

        def eq(self, *args):
            return self

        def single(self):
            return self

        def in_(self, *args):
            return self

        def execute(self):
            if self.table == "faculty_subject_assignments":
                return SimpleNamespace(data={
                    "id": str(assignment_id),
                    "faculty_id": str(faculty_id),
                    "is_active": True,
                }, error=None)
            return SimpleNamespace(data=[{"id": str(uuid4())}], error=None)

    class FakeAdmin:
        def from_(self, table):
            return Query(table)

    monkeypatch.setattr(FacultyService, "_admin", staticmethod(lambda: FakeAdmin()))
    with pytest.raises(HTTPException) as exc:
        await FacultyService.create_session(
            faculty_id,
            SessionCreateRequest(assignment_id=assignment_id, session_date="2026-11-21"),
        )

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_successful_finalization(monkeypatch):
    faculty_id = uuid4()
    session_id = uuid4()
    session = AttendanceSessionResponse(
        id=session_id,
        assignment_id=uuid4(),
        created_by=faculty_id,
        session_date="2026-11-21",
        start_time="2026-11-21T10:00:00Z",
        status="review_pending",
        verification_method="webcam_face_recognition",
    )

    async def return_session(cls, owner_id, checked_session_id):
        return session

    class RPC:
        def execute(self):
            return SimpleNamespace(data={
                "status": "success",
                "session_id": str(session_id),
                "present_count": 20,
                "absent_count": 5,
            }, error=None)

    class UserClient:
        def rpc(self, name, args):
            assert name == "fn_finalize_attendance_session"
            assert args["p_session_id"] == str(session_id)
            return RPC()

    monkeypatch.setattr(FacultyService, "get_session", classmethod(return_session))
    monkeypatch.setattr(faculty_module, "get_supabase_user_client", lambda token: UserClient())

    result = await FacultyService.finalize_session(
        faculty_id,
        session_id,
        None,
        "verified-access-token",
    )

    assert result.status == "success"
    assert result.present_count == 20
    assert result.absent_count == 5


@pytest.mark.asyncio
async def test_finalization_rpc_exception(monkeypatch):
    session_id = uuid4()

    async def return_session(cls, faculty_id, checked_session_id):
        return AttendanceSessionResponse(
            id=session_id,
            assignment_id=uuid4(),
            created_by=faculty_id,
            session_date="2026-11-21",
            start_time="2026-11-21T10:00:00Z",
            status="review_pending",
            verification_method="webcam_face_recognition",
        )

    class RPC:
        def execute(self):
            raise Exception("RPC unavailable")

    class UserClient:
        def rpc(self, name, args):
            return RPC()

    monkeypatch.setattr(FacultyService, "get_session", classmethod(return_session))
    monkeypatch.setattr(faculty_module, "get_supabase_user_client", lambda token: UserClient())

    with pytest.raises(HTTPException) as exc:
        await FacultyService.finalize_session(uuid4(), session_id, None, "verified-access-token")

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_unauthorized_assignment_creation(monkeypatch):
    class Query:
        def select(self, *args):
            return self

        def eq(self, *args):
            return self

        def single(self):
            return self

        def execute(self):
            return SimpleNamespace(
                data=None,
                error=SimpleNamespace(code="PGRST116", message="No rows"),
            )

    class FakeAdmin:
        def from_(self, table):
            return Query()

    monkeypatch.setattr(FacultyService, "_admin", staticmethod(lambda: FakeAdmin()))

    with pytest.raises(HTTPException) as exc:
        await FacultyService.create_session(
            uuid4(),
            SessionCreateRequest(assignment_id=uuid4()),
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_database_session_insertion_failure(monkeypatch):
    faculty_id = uuid4()
    assignment_id = uuid4()

    class Query:
        def __init__(self, table):
            self.table = table

        def select(self, *args):
            return self

        def eq(self, *args):
            return self

        def single(self):
            return self

        def in_(self, *args):
            return self

        def insert(self, *args):
            return self

        def execute(self):
            if self.table == "faculty_subject_assignments":
                return SimpleNamespace(data={
                    "id": str(assignment_id),
                    "faculty_id": str(faculty_id),
                    "is_active": True,
                }, error=None)
            if self.table == "attendance_sessions":
                return SimpleNamespace(data=[], error=None)
            raise Exception("unexpected")

    class InsertingAdmin:
        def from_(self, table):
            query = Query(table)
            return query

    monkeypatch.setattr(FacultyService, "_admin", staticmethod(lambda: InsertingAdmin()))

    original_create = FacultyService.create_session
    # Exercise response-level insertion failure by monkeypatching the query only
    # cannot represent insert errors in this minimal fake, so verify controlled
    # response handling through the service's response branch.
    with pytest.raises(HTTPException) as exc:
        await original_create(
            faculty_id,
            SessionCreateRequest(assignment_id=assignment_id),
        )

    assert exc.value.status_code == 400


def _faculty_admin_with_session_insert_failure(insert_failure, faculty_id, assignment_id):
    class Query:
        def __init__(self, table):
            self.table = table
            self.inserted = False

        def select(self, *args):
            return self

        def eq(self, *args):
            return self

        def in_(self, *args):
            return self

        def single(self):
            return self

        def insert(self, *args):
            self.inserted = True
            return self

        def execute(self):
            if self.table == "faculty_subject_assignments":
                return SimpleNamespace(
                    data={
                        "id": str(assignment_id),
                        "faculty_id": str(faculty_id),
                        "is_active": True,
                    },
                    error=None,
                )
            if self.inserted:
                if isinstance(insert_failure, Exception):
                    raise insert_failure
                return insert_failure
            return SimpleNamespace(data=[], error=None)

    class FakeAdmin:
        def from_(self, table):
            return Query(table)

    return FakeAdmin()


@pytest.mark.asyncio
async def test_session_insert_response_error_logs_postgrest_fields_and_returns_detail(
    monkeypatch, caplog
):
    faculty_id = uuid4()
    assignment_id = uuid4()
    failure = APIError({
        "code": "23503",
        "message": 'violates foreign key constraint "attendance_sessions_assignment_id_fkey"',
        "details": "specific foreign key failure",
        "hint": "verify the assignment reference",
    })
    monkeypatch.setattr(
        FacultyService,
        "_admin",
        staticmethod(
            lambda: _faculty_admin_with_session_insert_failure(
                SimpleNamespace(data=None, error=failure),
                faculty_id,
                assignment_id,
            )
        ),
    )

    with caplog.at_level("ERROR", logger="uvicorn.error"):
        with pytest.raises(HTTPException) as exc:
            await FacultyService.create_session(
                faculty_id,
                SessionCreateRequest(assignment_id=assignment_id),
            )

    assert exc.value.status_code == 400
    assert "SQLSTATE 23503" in exc.value.detail
    assert failure.message in exc.value.detail
    assert failure.details in exc.value.detail
    assert failure.hint in exc.value.detail
    assert (
        "operation=faculty_attendance_session.insert "
        "error_type=APIError"
    ) in caplog.text
    assert "error_repr=" in caplog.text
    assert "api_code='23503'" in caplog.text
    assert "api_message=" in caplog.text
    assert "api_details=" in caplog.text
    assert "api_hint=" in caplog.text
    assert str(faculty_id) not in caplog.text
    assert str(assignment_id) not in caplog.text


@pytest.mark.asyncio
async def test_session_insert_exception_logs_traceback_and_returns_api_details(monkeypatch, caplog):
    faculty_id = uuid4()
    assignment_id = uuid4()
    failure = APIError({
        "code": "23503",
        "message": 'insert violates foreign key constraint "attendance_sessions_assignment_id_fkey"',
        "details": "specific constraint failure",
        "hint": "check the referenced row",
    })
    monkeypatch.setattr(
        FacultyService,
        "_admin",
        staticmethod(
            lambda: _faculty_admin_with_session_insert_failure(
                failure,
                faculty_id,
                assignment_id,
            )
        ),
    )

    with caplog.at_level("ERROR", logger="uvicorn.error"):
        with pytest.raises(HTTPException) as exc:
            await FacultyService.create_session(
                faculty_id,
                SessionCreateRequest(assignment_id=assignment_id),
            )

    assert exc.value.status_code == 400
    assert "SQLSTATE 23503" in exc.value.detail
    assert failure.message in exc.value.detail
    assert failure.details in exc.value.detail
    assert failure.hint in exc.value.detail
    assert "Traceback (most recent call last)" in caplog.text
    assert "error_type=APIError" in caplog.text
    assert "error_repr=" in caplog.text
    assert "sqlstate=23503" in caplog.text
    assert "attendance_sessions_assignment_id_fkey" in caplog.text
    assert "api_details=" in caplog.text
    assert "api_hint=" in caplog.text


@pytest.mark.asyncio
async def test_session_insert_unique_violation_remains_conflict(monkeypatch):
    faculty_id = uuid4()
    assignment_id = uuid4()

    class PostgrestFailure(Exception):
        code = "23505"
        message = 'duplicate key violates constraint "attendance_sessions_unique_open"'

    monkeypatch.setattr(
        FacultyService,
        "_admin",
        staticmethod(
            lambda: _faculty_admin_with_session_insert_failure(
                PostgrestFailure(),
                faculty_id,
                assignment_id,
            )
        ),
    )

    with pytest.raises(HTTPException) as exc:
        await FacultyService.create_session(
            faculty_id,
            SessionCreateRequest(assignment_id=assignment_id),
        )

    assert exc.value.status_code == 409
    assert exc.value.detail == "An open attendance session already exists for this assignment."


@pytest.mark.parametrize(
    ("code", "message", "expected_sqlstate", "expected_constraint"),
    [
        ("bad-code", 'constraint "valid_constraint"', "null", "valid_constraint"),
        ("23503", 'constraint "invalid-name"', "23503", "null"),
        (None, None, "null", "null"),
    ],
)
def test_backend_error_diagnostics_reject_invalid_values(
    caplog, code, message, expected_sqlstate, expected_constraint
):
    error = SimpleNamespace(
        code=code,
        message=message,
        details="private-record-details",
    )

    with caplog.at_level("ERROR", logger="uvicorn.error"):
        FacultyService._log_backend_error("faculty.test.operation", error)

    assert "operation=faculty.test.operation" in caplog.text
    assert f"sqlstate={expected_sqlstate} constraint={expected_constraint}" in caplog.text
    assert "api_details='private-record-details'" in caplog.text


def test_faculty_session_service_uses_service_role_client(monkeypatch):
    admin_client = object()
    monkeypatch.setattr(
        faculty_module,
        "get_supabase_admin_client",
        lambda: admin_client,
    )

    assert FacultyService._admin() is admin_client


@pytest.mark.asyncio
async def test_finalization_response_level_failure(monkeypatch):
    faculty_id = uuid4()
    session_id = uuid4()

    async def return_session(cls, owner_id, checked_session_id):
        return AttendanceSessionResponse(
            id=session_id,
            assignment_id=uuid4(),
            created_by=faculty_id,
            session_date="2026-11-21",
            start_time="2026-11-21T10:00:00Z",
            status="review_pending",
            verification_method="webcam_face_recognition",
        )

    class RPC:
        def execute(self):
            return SimpleNamespace(
                data=None,
                error=SimpleNamespace(code="PGRST", message="RPC failed"),
            )

    class UserClient:
        def rpc(self, name, args):
            return RPC()

    monkeypatch.setattr(FacultyService, "get_session", classmethod(return_session))
    monkeypatch.setattr(faculty_module, "get_supabase_user_client", lambda token: UserClient())

    with pytest.raises(HTTPException) as exc:
        await FacultyService.finalize_session(faculty_id, session_id, None, "token")

    assert exc.value.status_code == 409


def test_supabase_publishable_key_is_sent_as_apikey():
    captured = {}

    def handler(request):
        captured["apikey"] = request.headers.get("apikey")
        captured["authorization"] = request.headers.get("Authorization")
        return httpx.Response(
            200,
            json={"status": "success"},
            request=request,
        )

    mock_transport = httpx.Client(transport=httpx.MockTransport(handler))
    client = create_client(
        "https://example.supabase.co",
        "sb_publishable_test",
        ClientOptions(httpx_client=mock_transport),
    )
    client.postgrest.auth("eyJ.fake.faculty-token")
    client.rpc("fn_finalize_attendance_session", {"p_session_id": str(uuid4())}).execute()

    assert captured["apikey"] == "sb_publishable_test"
    assert captured["authorization"] == "Bearer eyJ.fake.faculty-token"


def test_supabase_publishable_key_is_not_used_as_bearer_token():
    captured = {}

    def handler(request):
        captured["authorization"] = request.headers.get("Authorization")
        captured["apikey"] = request.headers.get("apikey")
        return httpx.Response(
            200,
            json={"status": "success"},
            request=request,
        )

    mock_transport = httpx.Client(transport=httpx.MockTransport(handler))
    client = create_client(
        "https://example.supabase.co",
        "sb_publishable_test",
        ClientOptions(httpx_client=mock_transport),
    )
    client.postgrest.auth("eyJ.fake.faculty-token")
    client.rpc("fn_finalize_attendance_session", {"p_session_id": str(uuid4())}).execute()

    assert captured["authorization"] != "Bearer sb_publishable_test"
    assert captured["authorization"] == "Bearer eyJ.fake.faculty-token"

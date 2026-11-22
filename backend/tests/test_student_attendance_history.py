from datetime import date
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import app.services.student_biometric_service as student_service_module
from app.core.security import get_current_user_from_token
from app.main import app
from app.schemas.student_attendance import StudentAttendanceHistoryRecord
from app.services.student_biometric_service import StudentBiometricService


class HistoryQuery:
    def __init__(self, data=None, error=None):
        self.data = data
        self.error = error
        self.filters = []
        self.ordering = None

    def select(self, columns):
        self.columns = columns
        return self

    def eq(self, column, value):
        self.filters.append(("eq", column, value))
        return self

    def in_(self, column, values):
        self.filters.append(("in", column, values))
        return self

    def order(self, column, desc=False):
        self.ordering = (column, desc)
        return self

    def execute(self):
        return SimpleNamespace(data=self.data, error=self.error)


class HistoryClient:
    def __init__(self, records_query, sessions_query):
        self.queries = {
            "attendance_records": records_query,
            "attendance_sessions": sessions_query,
        }
        self.tables = []

    def from_(self, table):
        self.tables.append(table)
        return self.queries[table]


@pytest.mark.asyncio
async def test_history_uses_student_scoped_jwt_and_only_completed_sessions(monkeypatch):
    student_id = uuid4()
    completed_session_id = uuid4()
    active_session_id = uuid4()
    access_token = "student-jwt-from-auth"
    records_query = HistoryQuery([
        {"session_id": str(completed_session_id), "status": "absent"},
        {"session_id": str(active_session_id), "status": "present"},
    ])
    sessions_query = HistoryQuery([
        {
            "id": str(completed_session_id),
            "session_date": "2026-11-20",
            "status": "completed",
            "assignment": {
                "subject": {"code": "CS101", "name": "Algorithms"},
            },
        },
        {
            "id": str(active_session_id),
            "session_date": "2026-11-21",
            "status": "active_scanning",
            "assignment": {
                "subject": {"code": "CS102", "name": "Databases"},
            },
        },
    ])
    client = HistoryClient(records_query, sessions_query)
    received_tokens = []

    def user_client(token):
        received_tokens.append(token)
        return client

    def reject_admin_client():
        raise AssertionError("Attendance history must not use the service-role client.")

    monkeypatch.setattr(student_service_module, "get_supabase_user_client", user_client)
    monkeypatch.setattr(student_service_module, "get_supabase_admin_client", reject_admin_client)

    result = await StudentBiometricService.list_attendance_history(student_id, access_token)

    assert received_tokens == [access_token]
    assert client.tables == ["attendance_records", "attendance_sessions"]
    assert ("eq", "student_id", str(student_id)) in records_query.filters
    assert ("eq", "status", "completed") in sessions_query.filters
    assert ("in", "id", [str(completed_session_id), str(active_session_id)]) in sessions_query.filters
    assert sessions_query.ordering == ("session_date", True)
    assert result == [
        {
            "session_id": completed_session_id,
            "session_date": date(2026, 11, 20),
            "subject_name": "Algorithms",
            "subject_code": "CS101",
            "status": "absent",
        }
    ]


@pytest.mark.asyncio
async def test_history_requires_user_scoped_database_client(monkeypatch):
    monkeypatch.setattr(student_service_module, "get_supabase_user_client", lambda token: None)

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.list_attendance_history(uuid4(), "")

    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_history_query_failure_is_not_reported_as_empty(monkeypatch):
    records_query = HistoryQuery(error=SimpleNamespace(message="RLS denied"))
    client = HistoryClient(records_query, HistoryQuery())
    monkeypatch.setattr(student_service_module, "get_supabase_user_client", lambda token: client)

    with pytest.raises(HTTPException) as exc:
        await StudentBiometricService.list_attendance_history(uuid4(), "student-jwt")

    assert exc.value.status_code == 502


def test_history_route_uses_authenticated_student_identity(monkeypatch):
    student_id = uuid4()
    access_token = "student-jwt-from-auth"
    captured = {}

    async def fake_history(cls, student_id, access_token):
        captured["student_id"] = student_id
        captured["access_token"] = access_token
        return [
            StudentAttendanceHistoryRecord(
                session_id=uuid4(),
                session_date=date(2026, 11, 20),
                subject_name="Algorithms",
                subject_code="CS101",
                status="present",
            )
        ]

    monkeypatch.setattr(
        StudentBiometricService,
        "list_attendance_history",
        classmethod(fake_history),
    )
    previous = app.dependency_overrides.get(get_current_user_from_token)
    app.dependency_overrides[get_current_user_from_token] = lambda: {
        "id": str(student_id),
        "role": "student",
        "access_token": access_token,
    }
    try:
        response = TestClient(app).get("/api/v1/student/attendance/history")
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_current_user_from_token, None)
        else:
            app.dependency_overrides[get_current_user_from_token] = previous

    assert response.status_code == 200
    assert captured == {
        "student_id": student_id,
        "access_token": access_token,
    }
    assert response.json()[0]["status"] == "present"


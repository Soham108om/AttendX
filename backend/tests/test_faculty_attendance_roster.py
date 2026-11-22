from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.schemas.faculty import AttendanceSessionResponse
from app.services.faculty_service import FacultyService


@pytest.mark.asyncio
async def test_session_attendance_includes_unmarked_students_from_class_roster(monkeypatch):
    faculty_id = uuid4()
    session_id = uuid4()
    assignment_id = uuid4()
    class_id = uuid4()
    marked_student_id = uuid4()
    unmarked_student_id = uuid4()
    attendance_id = uuid4()

    session = AttendanceSessionResponse(
        id=session_id,
        assignment_id=assignment_id,
        created_by=faculty_id,
        session_date="2026-11-22",
        start_time="2026-11-22T10:00:00Z",
        status="active_scanning",
        verification_method="webcam_face_recognition",
    )

    class Query:
        def __init__(self, table):
            self.table = table

        def select(self, *args):
            return self

        def eq(self, *args):
            return self

        def single(self):
            return self

        def order(self, *args, **kwargs):
            return self

        def execute(self):
            if self.table == "faculty_subject_assignments":
                data = {"class_id": str(class_id)}
            elif self.table == "students":
                data = [
                    {
                        "id": str(marked_student_id),
                        "roll_number": "01",
                        "registration_number": "REG-01",
                        "profile": {"full_name": "Marked Student"},
                    },
                    {
                        "id": str(unmarked_student_id),
                        "roll_number": "02",
                        "registration_number": "REG-02",
                        "profile": {"full_name": "Unmarked Student"},
                    },
                ]
            else:
                data = [
                    {
                        "id": str(attendance_id),
                        "session_id": str(session_id),
                        "student_id": str(marked_student_id),
                        "status": "present",
                        "marked_at": "2026-11-22T10:05:00Z",
                        "student": {
                            "roll_number": "01",
                            "registration_number": "REG-01",
                            "profile": {"full_name": "Marked Student"},
                        },
                    }
                ]
            return SimpleNamespace(data=data, error=None)

    class Admin:
        def from_(self, table):
            return Query(table)

    async def get_session(cls, requested_faculty_id, requested_session_id):
        assert requested_faculty_id == faculty_id
        assert requested_session_id == session_id
        return session

    monkeypatch.setattr(FacultyService, "_admin", staticmethod(lambda: Admin()))
    monkeypatch.setattr(FacultyService, "get_session", classmethod(get_session))

    records = await FacultyService.get_session_attendance(faculty_id, session_id)

    assert [record.student_id for record in records] == [
        marked_student_id,
        unmarked_student_id,
    ]
    assert [record.status for record in records] == ["present", "not_marked"]
    assert records[0].id == attendance_id
    assert records[1].id == unmarked_student_id
    assert records[1].full_name == "Unmarked Student"
    assert records[1].roll_number == "02"
    assert records[1].marked_at is None

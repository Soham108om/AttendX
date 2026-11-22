import logging
import re
import secrets
import string
from typing import Dict, Any, List, Optional
from uuid import UUID
from fastapi import HTTPException, status
from app.core.supabase import get_supabase_admin_client
from app.services.student_biometric_service import StudentBiometricService
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

logger = logging.getLogger("uvicorn.error")


def generate_secure_password(length: int = 12) -> str:
    """
    Generates an institutional-grade random password with guaranteed
    character diversity (uppercase, lowercase, numbers, and symbols).
    """
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        password = ''.join(secrets.choice(alphabet) for _ in range(length))
        if (any(c.islower() for c in password)
                and any(c.isupper() for c in password)
                and any(c.isdigit() for c in password)
                and any(c in "!@#$%^&*" for c in password)):
            return password


class ProvisioningService:
    @staticmethod
    def _get_admin_client():
        admin = get_supabase_admin_client()
        if not admin:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database service connection is not configured on the backend.",
            )
        return admin

    @classmethod
    def _auth_account_status(cls, admin, user_id: str) -> Dict[str, Any]:
        try:
            response = admin.auth.admin.get_user_by_id(user_id)
            user = getattr(response, "user", response)
            if user is None:
                return {"status": "inactive", "is_active": False}
            banned_until = getattr(user, "banned_until", None)
            if banned_until is None and isinstance(user, dict):
                banned_until = user.get("banned_until")
            return {
                "status": "inactive" if banned_until else "active",
                "is_active": not bool(banned_until),
            }
        except Exception:
            return {"status": "unknown", "is_active": None}

    @classmethod
    def _auth_account_is_active(cls, admin, user_id: str) -> bool:
        """Compatibility helper for existing tests."""
        status_result = cls._auth_account_status(admin, user_id)
        return bool(status_result["is_active"])

    @classmethod
    def _response_error(cls, response: Any) -> Optional[str]:
        error = getattr(response, "error", None)
        if error:
            return str(getattr(error, "message", error))
        data = getattr(response, "data", None)
        if isinstance(data, dict) and data.get("error"):
            return str(data.get("message") or data["error"])
        return None

    @classmethod
    def _verify_database_removed(cls, admin, table: str, user_id: str) -> bool:
        try:
            response = admin.from_(table).select("id").eq("id", user_id).execute()
            if cls._response_error(response):
                return False
            return not bool(getattr(response, "data", None))
        except Exception:
            return False

    @classmethod
    def _verify_auth_removed(cls, admin, user_id: str) -> bool:
        try:
            response = admin.auth.admin.get_user_by_id(user_id)
            user = getattr(response, "user", response)
            return user is None
        except Exception:
            return False

    @classmethod
    def _postgres_error_code(cls, exc: Any) -> Optional[str]:
        code = getattr(exc, "code", None)
        if code:
            return str(code)
        message = str(exc)
        if "23505" in message:
            return "23505"
        return None

    @classmethod
    def _log_assignment_insert_failure(cls, error: Any) -> None:
        if isinstance(error, dict):
            code = error.get("code")
            message = error.get("message")
        else:
            code = getattr(error, "code", None)
            message = getattr(error, "message", None)

        sqlstate = (
            code
            if isinstance(code, str) and re.fullmatch(r"[0-9A-Z]{5}", code)
            else "null"
        )
        constraint_name = "null"
        if isinstance(message, str):
            match = re.search(r'\bconstraint\s+"([^"]+)"', message, re.IGNORECASE)
            if match and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", match.group(1)):
                constraint_name = match.group(1)

        error_type = type(error).__name__ if isinstance(error, BaseException) else "null"
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", error_type):
            error_type = "null"

        logger.warning(
            "operation=%s sqlstate=%s constraint=%s error_type=%s",
            "faculty_subject_class_assignment.insert",
            sqlstate,
            constraint_name,
            error_type,
        )

    @classmethod
    def _rollback_provisioning(cls, admin, user_id: str, entity_table: str) -> bool:
        entity_cleanup_ok = True
        profile_cleanup_ok = True
        auth_cleanup_ok = True
        try:
            response = admin.from_(entity_table).delete().eq("id", user_id).execute()
            if cls._response_error(response):
                entity_cleanup_ok = False
        except Exception:
            entity_cleanup_ok = False
        try:
            response = admin.from_("profiles").delete().eq("id", user_id).execute()
            if cls._response_error(response):
                profile_cleanup_ok = False
        except Exception:
            profile_cleanup_ok = False
        try:
            admin.auth.admin.delete_user(user_id)
        except Exception:
            auth_cleanup_ok = False

        entity_cleanup_ok = entity_cleanup_ok and cls._verify_database_removed(admin, entity_table, user_id)
        profile_cleanup_ok = profile_cleanup_ok and cls._verify_database_removed(admin, "profiles", user_id)
        auth_cleanup_ok = auth_cleanup_ok and cls._verify_auth_removed(admin, user_id)
        return entity_cleanup_ok and profile_cleanup_ok and auth_cleanup_ok

    # =========================================================================
    # FACULTY PROVISIONING
    # =========================================================================

    @classmethod
    async def provision_faculty(cls, req: FacultyProvisionRequest) -> ProvisionResult:
        admin = cls._get_admin_client()
        email_clean = str(req.email).strip().lower()

        # 1. Validate department existence
        dept_res = admin.from_("departments").select("id, code, name").eq("id", str(req.department_id)).execute()
        if not dept_res.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Department with ID {req.department_id} does not exist.",
            )
        department = dept_res.data[0]

        # 2. Check for duplicate faculty ID number
        fid_res = admin.from_("faculty").select("id").eq("faculty_id_number", req.faculty_id_number.strip()).execute()
        if fid_res.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Faculty ID number '{req.faculty_id_number}' is already assigned to another staff member.",
            )

        profile_res = admin.from_("profiles").select("id").eq("email", email_clean).execute()
        if profile_res.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists.",
            )

        # 3. Secure initial password
        password = req.initial_password or generate_secure_password()
        # 4. Create Supabase Auth user
        try:
            auth_user_res = admin.auth.admin.create_user({
                "email": email_clean,
                "password": password,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": req.full_name.strip(),
                    "role": "faculty",
                },
            })
            if not auth_user_res or not auth_user_res.user:
                raise Exception("Auth user creation failed to return a valid user object.")
            new_user_id = str(auth_user_res.user.id)
        except Exception as exc:
            message = str(exc).lower()
            if "already" in message or "exists" in message or "duplicate" in message:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this email already exists.",
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create the Supabase Auth account.",
            )

        # 5. Insert Database Records with Rollback Guarantee
        try:
            # 5a. Insert public.profiles
            profile_data = {
                "id": new_user_id,
                "email": email_clean,
                "full_name": req.full_name.strip(),
                "role": "faculty",
            }
            admin.from_("profiles").insert([profile_data]).execute()

            # 5b. Insert public.faculty
            faculty_data = {
                "id": new_user_id,
                "department_id": str(req.department_id),
                "faculty_id_number": req.faculty_id_number.strip(),
                "designation": req.designation.strip(),
            }
            admin.from_("faculty").insert([faculty_data]).execute()

            return ProvisionResult(
                user_id=UUID(new_user_id),
                email=email_clean,
                full_name=req.full_name.strip(),
                role="faculty",
                initial_password=password,
                entity_id=UUID(new_user_id),
                details={
                    "faculty_id_number": req.faculty_id_number.strip(),
                    "designation": req.designation.strip(),
                    "department_code": department.get("code"),
                    "department_name": department.get("name"),
                },
                message="Faculty account provisioned successfully.",
            )
        except Exception as db_exc:
            cleaned = cls._rollback_provisioning(admin, new_user_id, "faculty")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Database record creation failed. {'Provisioning rollback completed.' if cleaned else 'Provisioning rollback was incomplete; the account requires manual cleanup.'}"
                ),
            )

    @classmethod
    async def get_faculty_list(cls) -> List[Dict[str, Any]]:
        admin = cls._get_admin_client()
        res = admin.from_("faculty").select(
            "id, faculty_id_number, designation, created_at, department_id, "
            "profile:profiles(full_name, email), "
            "department:departments(code, name)"
        ).order("created_at", desc=True).execute()

        results = []
        for row in res.data or []:
            profile = row.get("profile") or {}
            dept = row.get("department") or {}
            auth_status = cls._auth_account_status(admin, str(row.get("id")))
            results.append({
                "id": row.get("id"),
                "email": profile.get("email"),
                "full_name": profile.get("full_name"),
                "faculty_id_number": row.get("faculty_id_number"),
                "department_id": row.get("department_id"),
                "designation": row.get("designation"),
                "department_code": dept.get("code"),
                "department_name": dept.get("name"),
                "is_active": auth_status["is_active"],
                "account_status": auth_status["status"],
                "created_at": row.get("created_at"),
            })
        return results

    @classmethod
    async def update_faculty(cls, faculty_id: UUID, req: FacultyUpdateRequest) -> Dict[str, Any]:
        admin = cls._get_admin_client()
        fid_str = str(faculty_id)
        existing = admin.from_("faculty").select("id").eq("id", fid_str).execute()
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty member not found.")

        if req.department_id:
            department = admin.from_("departments").select("id").eq("id", str(req.department_id)).execute()
            if not department.data:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department not found.")

        if req.faculty_id_number:
            duplicate = (
                admin.from_("faculty")
                .select("id")
                .eq("faculty_id_number", req.faculty_id_number.strip())
                .neq("id", fid_str)
                .execute()
            )
            if duplicate.data:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Faculty ID number is already assigned.")

        # Update profile if full_name is supplied
        if req.full_name:
            admin.from_("profiles").update({"full_name": req.full_name.strip()}).eq("id", fid_str).execute()

        # Update faculty fields if supplied
        faculty_updates = {}
        if req.faculty_id_number:
            faculty_updates["faculty_id_number"] = req.faculty_id_number.strip()
        if req.department_id:
            faculty_updates["department_id"] = str(req.department_id)
        if req.designation:
            faculty_updates["designation"] = req.designation.strip()

        if faculty_updates:
            admin.from_("faculty").update(faculty_updates).eq("id", fid_str).execute()

        return {"status": "success", "message": "Faculty details updated successfully."}

    @classmethod
    async def deactivate_faculty(cls, faculty_id: UUID) -> Dict[str, Any]:
        admin = cls._get_admin_client()
        fid_str = str(faculty_id)
        existing = admin.from_("faculty").select("id").eq("id", fid_str).execute()
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty member not found.")

        try:
            admin.auth.admin.update_user_by_id(fid_str, {"ban_duration": "876000h"})
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Faculty account could not be suspended in Supabase Auth. No deactivation was applied.",
            )

        try:
            admin.from_("faculty_subject_assignments").update({"is_active": False}).eq("faculty_id", fid_str).execute()
        except Exception:
            try:
                admin.auth.admin.update_user_by_id(fid_str, {"ban_duration": "none"})
            except Exception:
                pass
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Teaching assignments could not be deactivated. Faculty Auth suspension was rolled back.",
            )

        return {
            "status": "success",
            "message": "Faculty safely deactivated. Active teaching allocations set to inactive.",
        }

    # =========================================================================
    # STUDENT PROVISIONING
    # =========================================================================

    @classmethod
    async def provision_student(cls, req: StudentProvisionRequest) -> ProvisionResult:
        admin = cls._get_admin_client()
        email_clean = str(req.email).strip().lower()

        # 1. Validate class existence
        class_res = admin.from_("classes").select("id, name, department_id, department:departments(code)").eq("id", str(req.class_id)).execute()
        if not class_res.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Class with ID {req.class_id} does not exist.",
            )
        class_info = class_res.data[0]

        # 2. Check for duplicate roll or registration numbers
        dup_roll = admin.from_("students").select("id").eq("roll_number", req.roll_number.strip()).execute()
        if dup_roll.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Roll number '{req.roll_number}' is already assigned to another student.",
            )

        dup_reg = admin.from_("students").select("id").eq("registration_number", req.registration_number.strip()).execute()
        if dup_reg.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Registration number '{req.registration_number}' is already registered.",
            )

        profile_res = admin.from_("profiles").select("id").eq("email", email_clean).execute()
        if profile_res.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists.",
            )

        # 3. Secure initial password
        password = req.initial_password or generate_secure_password()
        # 4. Create Supabase Auth user
        try:
            auth_user_res = admin.auth.admin.create_user({
                "email": email_clean,
                "password": password,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": req.full_name.strip(),
                    "role": "student",
                },
            })
            if not auth_user_res or not auth_user_res.user:
                raise Exception("Auth user creation failed to return a valid user object.")
            new_user_id = str(auth_user_res.user.id)
        except Exception as exc:
            message = str(exc).lower()
            if "already" in message or "exists" in message or "duplicate" in message:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this email already exists.",
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create the Supabase Auth account.",
            )

        # 5. Insert Database Records with Rollback Guarantee
        try:
            # 5a. Insert public.profiles
            profile_data = {
                "id": new_user_id,
                "email": email_clean,
                "full_name": req.full_name.strip(),
                "role": "student",
            }
            admin.from_("profiles").insert([profile_data]).execute()

            # 5b. Insert public.students
            student_data = {
                "id": new_user_id,
                "class_id": str(req.class_id),
                "roll_number": req.roll_number.strip(),
                "registration_number": req.registration_number.strip(),
                "face_enrolled": False,
            }
            admin.from_("students").insert([student_data]).execute()

            dept_obj = class_info.get("department") or {}
            dept_code = dept_obj.get("code") if isinstance(dept_obj, dict) else None

            return ProvisionResult(
                user_id=UUID(new_user_id),
                email=email_clean,
                full_name=req.full_name.strip(),
                role="student",
                initial_password=password,
                entity_id=UUID(new_user_id),
                details={
                    "roll_number": req.roll_number.strip(),
                    "registration_number": req.registration_number.strip(),
                    "class_name": class_info.get("name"),
                    "department_code": dept_code,
                },
                message="Student account provisioned successfully.",
            )
        except Exception as db_exc:
            cleaned = cls._rollback_provisioning(admin, new_user_id, "students")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Database record creation failed. {'Provisioning rollback completed.' if cleaned else 'Provisioning rollback was incomplete; the account requires manual cleanup.'}"
                ),
            )

    @classmethod
    async def get_students_list(cls, class_id: Optional[UUID] = None) -> List[Dict[str, Any]]:
        admin = cls._get_admin_client()
        query = admin.from_("students").select(
            "id, roll_number, registration_number, face_enrolled, created_at, class_id, "
            "profile:profiles(full_name, email), "
            "class:classes(name, department_id, department:departments(code))"
        )
        if class_id:
            query = query.eq("class_id", str(class_id))

        res = query.order("roll_number", desc=False).execute()
        student_rows = res.data or []
        enrolled_student_ids = [
            str(row.get("id"))
            for row in student_rows
            if row.get("face_enrolled") is True and row.get("id")
        ]
        embeddings_by_student: Dict[str, List[Dict[str, Any]]] = {}
        if enrolled_student_ids:
            try:
                embedding_res = (
                    admin.from_("face_embeddings")
                    .select("student_id, sample_index, is_active, model_version, quality_score, embedding_vector")
                    .in_("student_id", enrolled_student_ids)
                    .execute()
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Could not verify student face enrolment status.",
                ) from exc
            if cls._response_error(embedding_res):
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Could not verify student face enrolment status.",
                )
            for embedding in embedding_res.data or []:
                student_id = str(embedding.get("student_id"))
                embeddings_by_student.setdefault(student_id, []).append(embedding)

        results = []
        for row in student_rows:
            profile = row.get("profile") or {}
            class_dict = row.get("class") or {}
            dept = class_dict.get("department") or {}
            auth_status = cls._auth_account_status(admin, str(row.get("id")))
            student_id = str(row.get("id"))
            results.append({
                "id": row.get("id"),
                "email": profile.get("email"),
                "full_name": profile.get("full_name"),
                "roll_number": row.get("roll_number"),
                "registration_number": row.get("registration_number"),
                "class_id": row.get("class_id"),
                "class_name": class_dict.get("name"),
                "department_code": dept.get("code") if isinstance(dept, dict) else None,
                "face_enrolled": StudentBiometricService.has_complete_enrolment(
                    row.get("face_enrolled"),
                    embeddings_by_student.get(student_id, []),
                ),
                "is_active": auth_status["is_active"],
                "account_status": auth_status["status"],
                "created_at": row.get("created_at"),
            })
        return results

    @classmethod
    async def update_student(cls, student_id: UUID, req: StudentUpdateRequest) -> Dict[str, Any]:
        admin = cls._get_admin_client()
        sid_str = str(student_id)
        existing = admin.from_("students").select("id").eq("id", sid_str).execute()
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

        if req.class_id:
            class_check = admin.from_("classes").select("id").eq("id", str(req.class_id)).execute()
            if not class_check.data:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Class not found.")

        if req.roll_number:
            duplicate = (
                admin.from_("students").select("id")
                .eq("roll_number", req.roll_number.strip())
                .neq("id", sid_str)
                .execute()
            )
            if duplicate.data:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Roll number is already assigned.")

        if req.registration_number:
            duplicate = (
                admin.from_("students").select("id")
                .eq("registration_number", req.registration_number.strip())
                .neq("id", sid_str)
                .execute()
            )
            if duplicate.data:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Registration number is already assigned.")

        if req.full_name:
            admin.from_("profiles").update({"full_name": req.full_name.strip()}).eq("id", sid_str).execute()

        student_updates = {}
        if req.registration_number:
            student_updates["registration_number"] = req.registration_number.strip()
        if req.class_id:
            student_updates["class_id"] = str(req.class_id)
        if req.roll_number:
            student_updates["roll_number"] = req.roll_number.strip()

        if student_updates:
            admin.from_("students").update(student_updates).eq("id", sid_str).execute()

        return {"status": "success", "message": "Student details updated successfully."}

    @classmethod
    async def deactivate_student(cls, student_id: UUID) -> Dict[str, Any]:
        admin = cls._get_admin_client()
        sid_str = str(student_id)
        existing = admin.from_("students").select("id").eq("id", sid_str).execute()
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")
        try:
            admin.auth.admin.update_user_by_id(sid_str, {"ban_duration": "876000h"})
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Student account could not be suspended in Supabase Auth. No deactivation was applied.",
            )

        return {
            "status": "success",
            "message": "Student safely deactivated. Account access suspended.",
        }

    # =========================================================================
    # ACADEMIC ASSIGNMENTS
    # =========================================================================

    @classmethod
    async def create_assignment(cls, req: AssignmentCreateRequest) -> Dict[str, Any]:
        admin = cls._get_admin_client()

        # 1. Validate relationships
        fac_check = admin.from_("faculty").select("id").eq("id", str(req.faculty_id)).execute()
        if not fac_check.data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Faculty member not found.")

        subj_check = admin.from_("subjects").select("id").eq("id", str(req.subject_id)).execute()
        if not subj_check.data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Subject not found.")

        class_check = admin.from_("classes").select("id").eq("id", str(req.class_id)).execute()
        if not class_check.data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Class not found.")

        # 2. Check for duplicate assignment
        dup_check = (
            admin.from_("faculty_subject_assignments")
            .select("id, is_active")
            .eq("faculty_id", str(req.faculty_id))
            .eq("subject_id", str(req.subject_id))
            .eq("class_id", str(req.class_id))
            .execute()
        )
        if dup_check.data:
            existing_assignment = dup_check.data[0]
            if existing_assignment.get("is_active"):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This faculty member already has an active assignment to this subject and class cohort.",
                )
            try:
                res = (
                    admin.from_("faculty_subject_assignments")
                    .update({"is_active": True})
                    .eq("id", existing_assignment["id"])
                    .execute()
                )
            except Exception as exc:
                if cls._postgres_error_code(exc) == "23505":
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="The faculty-subject-class assignment could not be reactivated due to a database conflict.",
                    ) from exc
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The faculty-subject-class assignment could not be reactivated.",
                ) from exc
            if cls._response_error(res):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The faculty-subject-class assignment could not be reactivated.",
                )
            assignment_data = (
                res.data[0]
                if isinstance(getattr(res, "data", None), list) and res.data
                else (getattr(res, "data", None) or {"id": existing_assignment["id"], "is_active": True})
            )
            return {"status": "success", "assignment": assignment_data}

        # 3. Create assignment
        try:
            payload = {
                "faculty_id": str(req.faculty_id),
                "subject_id": str(req.subject_id),
                "class_id": str(req.class_id),
                "is_active": True,
            }
            res = admin.from_("faculty_subject_assignments").insert([payload]).execute()
        except Exception as exc:
            cls._log_assignment_insert_failure(exc)
            if cls._postgres_error_code(exc) == "23505":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An assignment already exists for this faculty, subject, and class.",
                ) from exc
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The faculty-subject-class assignment could not be created.",
            ) from exc
        response_error = cls._response_error(res)
        if response_error:
            error = getattr(res, "error", None)
            cls._log_assignment_insert_failure(error)
            if getattr(error, "code", None) == "23505" or "23505" in response_error:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An assignment already exists for this faculty, subject, and class.",
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The faculty-subject-class assignment could not be created.",
            )

        assignment_data = (
            res.data[0]
            if isinstance(getattr(res, "data", None), list) and res.data
            else (getattr(res, "data", None) or payload)
        )
        return {"status": "success", "assignment": assignment_data}

    @classmethod
    async def get_assignments_list(cls) -> List[Dict[str, Any]]:
        admin = cls._get_admin_client()
        res = admin.from_("faculty_subject_assignments").select(
            "id, faculty_id, subject_id, class_id, is_active, created_at, "
            "faculty:faculty(faculty_id_number, profile:profiles(full_name)), "
            "subject:subjects(code, name), "
            "class:classes(name)"
        ).order("created_at", desc=True).execute()

        results = []
        for row in res.data or []:
            fac = row.get("faculty") or {}
            profile = fac.get("profile") or {}
            subj = row.get("subject") or {}
            cls_obj = row.get("class") or {}

            results.append({
                "id": row.get("id"),
                "faculty_id": row.get("faculty_id"),
                "subject_id": row.get("subject_id"),
                "class_id": row.get("class_id"),
                "is_active": row.get("is_active", True),
                "created_at": row.get("created_at"),
                "faculty_name": profile.get("full_name"),
                "faculty_id_number": fac.get("faculty_id_number"),
                "subject_code": subj.get("code"),
                "subject_name": subj.get("name"),
                "class_name": cls_obj.get("name"),
            })
        return results

    @classmethod
    async def toggle_assignment_status(cls, assignment_id: UUID) -> Dict[str, Any]:
        admin = cls._get_admin_client()
        aid_str = str(assignment_id)

        current = admin.from_("faculty_subject_assignments").select("is_active").eq("id", aid_str).single().execute()
        if not current.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found.")

        new_status = not current.data.get("is_active", True)
        try:
            response = admin.from_("faculty_subject_assignments").update({"is_active": new_status}).eq("id", aid_str).execute()
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The assignment status could not be updated.",
            ) from exc
        if cls._response_error(response):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The assignment status could not be updated.",
            )

        return {"status": "success", "is_active": new_status}

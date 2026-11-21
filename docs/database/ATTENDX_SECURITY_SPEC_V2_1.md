# ATTENDX_SECURITY_SPEC_V2_1
**System:** AttendX – AI-Powered Smart Attendance Management System (PS 18)  
**Document State:** Final Database Security Specification & Non-Destructive Migration Plan  
**Version:** 2.1  

---

## 1. Security Architecture Summary

This document governs the database security, privilege model, and Row Level Security (RLS) enforcement across all 13 application tables in Supabase PostgreSQL:

1. **Non-Recursive RLS:** RLS policies utilize hardened `SECURITY DEFINER` helper functions (`fn_get_my_role()`, `fn_is_admin()`, `fn_faculty_teaches_class()`, `fn_student_in_class()`) with fixed `search_path = public, pg_temp;` to prevent policy recursion on `profiles`.
2. **Caller Identity Verification:** Caller identity is derived exclusively from `auth.uid()`; client-supplied identity parameters are strictly prohibited in stored procedures.
3. **Session State Transitions:** Session progress follows a one-way progression: `scheduled` -> `active_scanning` -> `review_pending` -> `completed` (sealed) or `cancelled`. Reopening completed sessions is rejected by engine triggers.
4. **Attendance Mutation Guard:** Attendance records can only be created or updated if the session is currently in `active_scanning` or `review_pending`, the caller is the assigned faculty or admin, and the target student belongs to the class assigned to that session.
5. **No Delete on Attendance:** `DELETE` on `attendance_records` is disabled for all authenticated users. Corrections follow the formal `correction_requests` workflow.
6. **Append-Only Immutability:** `audit_logs` and `biometric_consent_events` are append-only. Triggers block user-initiated mutations while allowing foreign-key cascade actions (`ON DELETE SET NULL`).
7. **Biometric Data Isolation:** `face_embeddings` is accessible strictly to the backend `service_role`. No client role can query or modify biometric vectors directly.

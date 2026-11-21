# AttendX — Architecture & Technical Specifications
**System:** AttendX – AI-Powered Smart Attendance Management System  
**Problem Statement:** PS 18 – Smart Attendance via Face Recognition  
**Foundation Phase:** Phase 1 (Foundation & Project Scaffolding)

---

## 1. System Overview

AttendX is a full-stack, role-based smart attendance application designed for academic environments. It replaces manual roll calls and RFID badge scans with real-time, on-device facial recognition through standard laptop webcams, with future extensibility for classroom IP cameras.

The platform enforces strict role-based access control across three user personas:
1. **Administrators:** Manage academic structure, departments, classes, subjects, faculty allocations, and immutable audit logs.
2. **Faculty:** Launch live webcam scanning sessions, review real-time matches, conduct transactional finalization, and manage manual overrides.
3. **Students:** Control biometric consent, view personal attendance histories, review subject analytics, and submit attendance correction requests.

---

## 2. Architectural Boundaries & Component Responsibilities

```text
+---------------------------------------------------------------------------------+
|                               CLIENT TIER (BROWSER)                             |
|                                                                                 |
|  React 18 + Vite + TypeScript + Tailwind CSS                                    |
|  - HTML5 getUserMedia webcam stream                                             |
|  - Real-time bounding box canvas overlay (Green / Yellow / Red)                  |
|  - Supabase JS Client (Public Anon Key ONLY for Auth & RLS queries)             |
|  - Axios / Fetch REST calls to FastAPI backend                                  |
+---------------------------------------------------------------------------------+
                                       │
                                       ▼ (REST / JWT)
+---------------------------------------------------------------------------------+
|                            APPLICATION TIER (BACKEND)                           |
|                                                                                 |
|  Python 3.10 + FastAPI + Uvicorn                                                |
|  - /health and /api/v1 REST endpoints                                           |
|  - Pydantic v2 data validation schemas                                          |
|  - Supabase Python Client (Service Role Key for privileged operations)          |
|  - In-memory session deduplication buffer                                       |
|  - Planned AI Pipeline (YuNet Detector + SFace / MobileFaceNet ONNX)            |
+---------------------------------------------------------------------------------+
                                       │
                                       ▼ (PostgreSQL Connection / Service Role)
+---------------------------------------------------------------------------------+
|                            PERSISTENCE & SECURITY TIER                          |
|                                                                                 |
|  Supabase PostgreSQL                                                            |
|  - 13 Application Tables + Enums                                                |
|  - Row Level Security (RLS) on all tables                                       |
|  - Zero-recursion helper functions (fn_get_my_role, fn_is_admin)                |
|  - Transactional stored procedures (fn_finalize_attendance_session)             |
|  - Immutable audit logs and consent event ledgers                               |
+---------------------------------------------------------------------------------+
```

---

## 3. Security Guidelines & Secret Segregation

1. **Service-Role Key Custody:**
   - The Supabase `SUPABASE_SERVICE_ROLE_KEY` bypasses all Row Level Security.
   - It is strictly stored in backend `.env` files and read by `app/core/config.py`.
   - It is NEVER exposed, bundled, or mentioned in `frontend/` code.

2. **Client-Side Environment:**
   - Frontend reads ONLY `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   - The anon key enforces Postgres Row Level Security based on the caller's JWT `auth.uid()`.

3. **Biometric Privacy:**
   - Raw webcam frames are transiently processed in memory and discarded immediately after feature extraction.
   - Embeddings are accessible solely to the backend AI worker via service-role access.
   - Students can revoke consent at any time, which triggers the transactional `fn_purge_student_biometrics` procedure.

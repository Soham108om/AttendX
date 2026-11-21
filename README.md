# AttendX — AI-Powered Smart Attendance Management System
**Problem Statement:** PS 18 – Smart Attendance via Face Recognition  
**Current State:** Phase 1 (Foundation & Environment Scaffolding)

---

## 1. Project Overview

AttendX is a web-based, role-governed smart attendance management system. Using real-time computer vision through a standard laptop webcam, it detects and recognizes registered student faces, prevents duplicate marks through in-memory deduplication, and provides a two-stage transactional review process for faculty members.

The application serves three distinct user roles:
- **Admin:** Manages departments, classes, subjects, faculty-class assignments, and reviews immutable system audit logs.
- **Faculty:** Starts attendance sessions, conducts live multi-face scanning, reviews recognitions and uncertain detections, and confirms final attendance sheets.
- **Student:** Manages biometric consent (with right-to-be-forgotten deletion), tracks personal attendance percentages, and submits attendance dispute correction requests.

---

## 2. Technology Stack

- **Frontend:** React 19, Vite 8, TypeScript, Tailwind CSS, React Router v7, Lucide React, Supabase JS Client
- **Backend:** Python 3.10, FastAPI, Uvicorn, Pydantic v2, Supabase Python SDK
- **Database & Identity:** Supabase PostgreSQL, Supabase Auth, PostgreSQL Row Level Security (RLS)
- **Computer Vision (Phase 5):** OpenCV YuNet Face Detection + MobileFaceNet / SFace ONNX (CPU-optimized)

---

## 3. Prerequisites

- **Node.js:** v18.0.0 or higher (v24.11.0 recommended)
- **npm:** v9.0.0 or higher (11.6.1 recommended)
- **Python:** 3.10.x (64-bit)
- **Git:** Installed on host machine

---

## 4. Installation & Setup

### A. Clone Repository
```bash
git clone <repository-url>
cd AttendX
```

### B. Backend Virtual Environment & Dependencies
```bash
# From repository root
python -m venv backend/.venv

# Windows Activation:
.\backend\.venv\Scripts\Activate.ps1

# Linux/macOS Activation:
# source backend/.venv/bin/activate

# Install Backend Dependencies:
pip install -r backend/requirements.txt
```

### C. Frontend Dependencies
```bash
cd frontend
npm install
```

---

## 5. Environment Configuration

### Frontend Configuration (`frontend/.env`)
Copy `frontend/.env.example` to `frontend/.env`:
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-publishable-key
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

> **Security Note:** NEVER place the Supabase `service_role` key in frontend environment files.

### Backend Configuration (`backend/.env`)
Copy `backend/.env.example` to `backend/.env`:
```env
APP_ENV=development
APP_NAME=AttendX
API_V1_PREFIX=/api/v1
FRONTEND_ORIGIN=http://localhost:5173

SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key
```

---

## 6. Running the Application

### Start Backend Development Server
```bash
# In backend directory with virtual environment activated:
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```
- API Base: `http://localhost:8000`
- Interactive OpenAPI Docs: `http://localhost:8000/docs`
- Health Endpoint: `http://localhost:8000/health`

### Start Frontend Development Server
```bash
# In frontend directory:
cd frontend
npm run dev
```
- Application Web Shell: `http://localhost:5173`

---

## 7. Health Check Verification

Test backend connectivity directly:

```bash
# Using PowerShell:
Invoke-RestMethod -Uri "http://localhost:8000/health"

# Using cURL:
curl http://localhost:8000/health
```

Expected Response:
```json
{
  "status": "healthy",
  "service": "AttendX API"
}
```

---

## 8. Implementation Status

- [x] **Phase 1:** Environment setup, project structure, TypeScript build, FastAPI health check, and foundation documentation.
- [ ] **Phase 2:** Database schema verification and RLS policy application.
- [ ] **Phase 3:** Supabase Auth and role-based route protection.
- [ ] **Phase 4:** Academic management module (Admin dashboard).
- [ ] **Phase 5:** Biometric enrolment and AI feature extraction engine.
- [ ] **Phase 6:** Live attendance session and real-time bounding box stream.
- [ ] **Phase 7:** Two-stage faculty review, transactional finalization, audits, and analytics.
- [ ] **Phase 8:** On-device CPU benchmarking and final jury demonstration runbook.

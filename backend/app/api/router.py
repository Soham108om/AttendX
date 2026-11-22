from fastapi import APIRouter
from app.api.routes import health, admin, faculty, student

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(admin.router)
api_router.include_router(faculty.router)
api_router.include_router(student.router)

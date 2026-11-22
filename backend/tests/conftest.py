from contextlib import contextmanager
from uuid import uuid4

import pytest

from app.core.security import get_current_user_from_token
from app.main import app


@pytest.fixture
def authenticate_as():
    @contextmanager
    def override(role):
        dependency = get_current_user_from_token
        previous = app.dependency_overrides.get(dependency)
        user = {
            "id": str(uuid4()),
            "email": "test-user@example.invalid",
            "role": role,
            "full_name": "Test User",
            "access_token": "dependency-override-token",
        }
        app.dependency_overrides[dependency] = lambda: user
        try:
            yield
        finally:
            if previous is None:
                app.dependency_overrides.pop(dependency, None)
            else:
                app.dependency_overrides[dependency] = previous

    return override

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel


class ConsentStatusResponse(BaseModel):
    consent_given: bool
    consent_timestamp: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    active: bool
    face_enrolled: bool = False
    has_biometric_records: bool = False
    enrolment_state: Literal[
        "consent_not_given",
        "consent_revoked",
        "consent_active_face_not_enrolled",
        "face_enrolled",
        "review_required",
        "blocked_existing_records",
    ]


class ConsentActionResponse(BaseModel):
    status: Literal["consent_recorded", "consent_revoked"]
    active: bool
    consent_timestamp: Optional[datetime] = None
    revoked_at: Optional[datetime] = None


class EnrolmentResponse(BaseModel):
    status: Literal["enrolled"]
    samples_enrolled: int
    face_enrolled: bool = True


class RevocationResponse(BaseModel):
    status: Literal["consent_revoked", "partial_revocation"]
    consent_active: bool = False
    embeddings_deleted: bool
    face_enrolled: bool = False
    error_code: Optional[Literal["PARTIAL_REVOCATION"]] = None

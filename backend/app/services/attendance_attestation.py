from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID, uuid4


ATTESTATION_TTL_MS = 60_000
MIN_SECRET_BYTES = 32


@dataclass(frozen=True)
class AttendanceAttestation:
    student_id: UUID
    session_id: UUID
    issued_at_ms: int
    expires_at_ms: int
    nonce: UUID
    signature: str

    def rpc_arguments(self) -> dict[str, str]:
        return {
            "p_student_id": str(self.student_id),
            "p_session_id": str(self.session_id),
            "p_issued_at": _timestamp(self.issued_at_ms),
            "p_expires_at": _timestamp(self.expires_at_ms),
            "p_nonce": str(self.nonce),
            "p_signature": self.signature,
        }


def _secret_bytes(secret: str) -> bytes:
    encoded = secret.encode("utf-8")
    if len(encoded) < MIN_SECRET_BYTES:
        raise ValueError("Attendance attestation signing is not configured.")
    return encoded


def _timestamp(value_ms: int) -> str:
    return datetime.fromtimestamp(value_ms / 1000, tz=timezone.utc).isoformat()


def _payload(
    student_id: UUID,
    session_id: UUID,
    issued_at_ms: int,
    expires_at_ms: int,
    nonce: UUID,
) -> bytes:
    return "\n".join(
        (
            str(student_id),
            str(session_id),
            str(issued_at_ms),
            str(expires_at_ms),
            str(nonce),
        )
    ).encode("utf-8")


def issue_attestation(
    student_id: UUID,
    session_id: UUID,
    secret: str,
    *,
    now_ms: int | None = None,
) -> AttendanceAttestation:
    issued_at_ms = now_ms if now_ms is not None else time.time_ns() // 1_000_000
    expires_at_ms = issued_at_ms + ATTESTATION_TTL_MS
    nonce = uuid4()
    signature = hmac.new(
        _secret_bytes(secret),
        _payload(student_id, session_id, issued_at_ms, expires_at_ms, nonce),
        hashlib.sha256,
    ).hexdigest()
    return AttendanceAttestation(
        student_id=student_id,
        session_id=session_id,
        issued_at_ms=issued_at_ms,
        expires_at_ms=expires_at_ms,
        nonce=nonce,
        signature=signature,
    )


def verify_attestation(
    attestation: AttendanceAttestation,
    secret: str,
    *,
    now_ms: int | None = None,
) -> bool:
    current_ms = now_ms if now_ms is not None else time.time_ns() // 1_000_000
    if (
        attestation.expires_at_ms <= current_ms
        or attestation.expires_at_ms - attestation.issued_at_ms != ATTESTATION_TTL_MS
        or attestation.issued_at_ms > current_ms + 30_000
    ):
        return False
    expected = hmac.new(
        _secret_bytes(secret),
        _payload(
            attestation.student_id,
            attestation.session_id,
            attestation.issued_at_ms,
            attestation.expires_at_ms,
            attestation.nonce,
        ),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, attestation.signature)

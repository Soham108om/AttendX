from types import SimpleNamespace

import numpy as np
import pytest

from app.services.face_recognition_service import FaceRecognitionService


class FakeDetector:
    def __init__(self, faces):
        self.faces = faces
        self.input_size = None

    def setInputSize(self, size):
        self.input_size = size

    def detect(self, frame):
        return None, self.faces


class FakeRecognizer:
    def __init__(self, embedding=None):
        self.embedding = embedding if embedding is not None else np.ones(128, dtype=np.float32)

    def alignCrop(self, frame, landmarks):
        return np.zeros((112, 112, 3), dtype=np.uint8)

    def feature(self, aligned):
        return self.embedding.reshape(1, -1)


def face_row(confidence=0.99, x=100, y=100, width=200, height=200):
    face = np.zeros(15, dtype=np.float32)
    face[:4] = [x, y, width, height]
    face[4:14] = [
        150, 150,
        200, 150,
        175, 175,
        135, 195,
        215, 195,
    ]
    face[14] = confidence
    return face


def test_initialization_is_reported_when_models_are_injected():
    service = FaceRecognitionService(
        detector=FakeDetector(None),
        recognizer=FakeRecognizer(),
    )
    assert service.initialize() == {"status": "success", "initialized": True}


def test_invalid_image_payload_is_rejected(monkeypatch):
    service = FaceRecognitionService(
        detector=FakeDetector(None),
        recognizer=FakeRecognizer(),
    )
    assert service.detect_faces(b"")["status"] == "invalid_image"
    assert service.detect_faces(b"not-image" if False else b"x" * (11 * 1024 * 1024))["status"] == "invalid_image"


def test_invalid_decoded_image_is_rejected(monkeypatch):
    import cv2

    service = FaceRecognitionService(
        detector=FakeDetector(None),
        recognizer=FakeRecognizer(),
    )
    monkeypatch.setattr(cv2, "imdecode", lambda *args: None)

    result = service.detect_faces(b"invalid")
    assert result["status"] == "invalid_image"
    assert result["face_count"] == 0


def test_no_face_result(monkeypatch):
    import cv2

    service = FaceRecognitionService(
        detector=FakeDetector(np.empty((0, 15), dtype=np.float32)),
        recognizer=FakeRecognizer(),
    )
    monkeypatch.setattr(
        cv2,
        "imdecode",
        lambda *args: np.zeros((480, 640, 3), dtype=np.uint8),
    )

    result = service.detect_faces(b"valid")
    assert result["status"] == "no_face"
    assert result["face_count"] == 0


def test_multiple_face_result(monkeypatch):
    import cv2

    faces = np.vstack([face_row(), face_row(x=350)])
    service = FaceRecognitionService(
        detector=FakeDetector(faces),
        recognizer=FakeRecognizer(),
    )
    monkeypatch.setattr(
        cv2,
        "imdecode",
        lambda *args: np.zeros((480, 640, 3), dtype=np.uint8),
    )

    result = service.detect_faces(b"valid")
    assert result["status"] == "multiple_faces"
    assert result["face_count"] == 2


def test_poor_quality_result(monkeypatch):
    import cv2

    face = face_row(confidence=0.4)
    service = FaceRecognitionService(
        detector=FakeDetector(np.array([face], dtype=np.float32)),
        recognizer=FakeRecognizer(),
    )
    monkeypatch.setattr(
        cv2,
        "imdecode",
        lambda *args: np.zeros((480, 640, 3), dtype=np.uint8),
    )

    result = service.detect_faces(b"valid")
    assert result["status"] == "poor_quality"
    assert result["reason"] == "low_detection_confidence"


def test_embedding_dimension_normalization_and_validity(monkeypatch):
    import cv2

    embedding = np.arange(128, dtype=np.float32) + 1
    recognizer = FakeRecognizer(embedding)
    service = FaceRecognitionService(
        detector=FakeDetector(np.array([face_row()], dtype=np.float32)),
        recognizer=recognizer,
    )
    monkeypatch.setattr(
        cv2,
        "imdecode",
        lambda *args: np.full((480, 640, 3), 128, dtype=np.uint8),
    )
    monkeypatch.setattr(cv2, "cvtColor", lambda *args: np.ones((200, 200), dtype=np.uint8))
    monkeypatch.setattr(cv2, "Laplacian", lambda *args: SimpleNamespace(var=lambda: 100.0))
    result = service.extract_embedding(b"valid")

    assert result["status"] == "success"
    assert result["embedding_dimension"] == 128
    assert result["normalized"] is True
    assert result["embedding"].shape == (128,)
    assert np.isclose(np.linalg.norm(result["embedding"]), 1.0)


def test_invalid_embedding_dimension(monkeypatch):
    import cv2

    recognizer = FakeRecognizer(np.ones(64, dtype=np.float32))
    service = FaceRecognitionService(
        detector=FakeDetector(np.array([face_row()], dtype=np.float32)),
        recognizer=recognizer,
    )
    monkeypatch.setattr(
        cv2,
        "imdecode",
        lambda *args: np.full((480, 640, 3), 128, dtype=np.uint8),
    )
    monkeypatch.setattr(cv2, "cvtColor", lambda *args: np.ones((200, 200), dtype=np.uint8))
    monkeypatch.setattr(cv2, "Laplacian", lambda *args: SimpleNamespace(var=lambda: 100.0))

    result = service.extract_embedding(b"valid")
    assert result["status"] == "model_error"


def test_zero_vector_and_invalid_dimension_are_rejected():
    service = FaceRecognitionService()
    zero = np.zeros(128, dtype=np.float32)
    valid = np.ones(128, dtype=np.float32)

    assert service.compare_embeddings(zero, valid)["status"] == "model_error"
    assert service.compare_embeddings(valid, np.ones(127, dtype=np.float32))["status"] == "model_error"


def test_cosine_similarity_and_classification():
    service = FaceRecognitionService(
        matched_threshold=0.363,
        uncertain_threshold=0.300,
    )
    left = np.array([1.0] + [0.0] * 127, dtype=np.float32)
    right = np.array([1.0] + [0.0] * 127, dtype=np.float32)

    comparison = service.compare_embeddings(left, right)
    assert comparison["status"] == "success"
    assert np.isclose(comparison["similarity"], 1.0)
    assert service.classify_similarity(comparison["similarity"])["classification"] == "matched"
    assert service.classify_similarity(0.32)["classification"] == "uncertain"
    assert service.classify_similarity(0.10)["classification"] == "unknown"


def test_invalid_similarity_is_unknown():
    service = FaceRecognitionService()
    assert service.classify_similarity(float("nan"))["classification"] == "unknown"
    assert service.classify_similarity("invalid")["classification"] == "unknown"


def test_model_inference_failure_is_reported(monkeypatch):
    import cv2

    class FailingDetector(FakeDetector):
        def detect(self, frame):
            raise RuntimeError("inference unavailable")

    service = FaceRecognitionService(
        detector=FailingDetector(None),
        recognizer=FakeRecognizer(),
    )
    monkeypatch.setattr(
        cv2,
        "imdecode",
        lambda *args: np.zeros((480, 640, 3), dtype=np.uint8),
    )

    result = service.detect_faces(b"valid")
    assert result["status"] == "model_error"

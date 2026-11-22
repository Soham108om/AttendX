from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any, Literal

import cv2
import numpy as np


RecognitionStatus = Literal[
    "matched",
    "uncertain",
    "unknown",
    "no_face",
    "multiple_faces",
    "poor_quality",
    "invalid_image",
    "model_error",
]


class FaceRecognitionService:
    EMBEDDING_DIMENSION = 128
    DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024

    def __init__(
        self,
        matched_threshold: float = 0.363,
        uncertain_threshold: float = 0.300,
        max_image_bytes: int = DEFAULT_MAX_IMAGE_BYTES,
        detector: Any | None = None,
        recognizer: Any | None = None,
    ) -> None:
        if uncertain_threshold > matched_threshold:
            raise ValueError("uncertain_threshold must not exceed matched_threshold")
        if not 0.0 <= uncertain_threshold <= 1.0:
            raise ValueError("thresholds must be between 0 and 1")
        if not 0.0 <= matched_threshold <= 1.0:
            raise ValueError("thresholds must be between 0 and 1")

        backend_dir = Path(__file__).resolve().parents[2]
        self.yunet_path = backend_dir / "models" / "face_detection" / "face_detection_yunet_2023mar.onnx"
        self.sface_path = backend_dir / "models" / "face_recognition" / "face_recognition_sface_2021dec.onnx"
        self.matched_threshold = matched_threshold
        self.uncertain_threshold = uncertain_threshold
        self.max_image_bytes = max_image_bytes
        self._detector = detector
        self._recognizer = recognizer
        self._lock = threading.Lock()
        self._initialized = detector is not None and recognizer is not None

    def initialize(self) -> dict[str, Any]:
        if self._initialized:
            return {"status": "success", "initialized": True}

        with self._lock:
            if self._initialized:
                return {"status": "success", "initialized": True}
            try:
                if not self.yunet_path.is_file() or not self.sface_path.is_file():
                    raise FileNotFoundError("Required face model artifact is missing")

                detector = cv2.FaceDetectorYN.create(
                    str(self.yunet_path),
                    "",
                    (640, 480),
                    score_threshold=0.9,
                    nms_threshold=0.3,
                    top_k=5000,
                    backend_id=cv2.dnn.DNN_BACKEND_OPENCV,
                    target_id=cv2.dnn.DNN_TARGET_CPU,
                )
                recognizer = cv2.FaceRecognizerSF.create(
                    str(self.sface_path),
                    "",
                    backend_id=cv2.dnn.DNN_BACKEND_OPENCV,
                    target_id=cv2.dnn.DNN_TARGET_CPU,
                )
                self._detector = detector
                self._recognizer = recognizer
                self._initialized = True
                return {"status": "success", "initialized": True}
            except Exception:
                self._detector = None
                self._recognizer = None
                self._initialized = False
                return {
                    "status": "model_error",
                    "initialized": False,
                    "message": "Face models could not be initialized.",
                }

    def _ensure_initialized(self) -> dict[str, Any] | None:
        if not self._initialized:
            result = self.initialize()
            if result["status"] != "success":
                return result
        if self._detector is None or self._recognizer is None:
            return {"status": "model_error", "message": "Face recognition models are unavailable."}
        return None

    def _decode_image(self, image_bytes: bytes) -> dict[str, Any]:
        if not isinstance(image_bytes, (bytes, bytearray, memoryview)):
            return {"status": "invalid_image", "face_count": 0, "message": "Image must be supplied as bytes."}
        encoded = bytes(image_bytes)
        if not encoded:
            return {"status": "invalid_image", "face_count": 0, "message": "Image payload is empty."}
        if len(encoded) > self.max_image_bytes:
            return {
                "status": "invalid_image",
                "face_count": 0,
                "message": "Image payload exceeds the configured size limit.",
            }
        try:
            frame = cv2.imdecode(np.frombuffer(encoded, dtype=np.uint8), cv2.IMREAD_COLOR)
        except Exception:
            return {"status": "invalid_image", "face_count": 0, "message": "Image could not be decoded."}
        if frame is None or frame.size == 0:
            return {"status": "invalid_image", "face_count": 0, "message": "Image could not be decoded."}
        if frame.ndim != 3 or frame.shape[2] != 3:
            return {"status": "invalid_image", "face_count": 0, "message": "Image must contain BGR-compatible data."}
        return {"status": "success", "frame": frame}

    def _face_quality(self, frame: np.ndarray, face: np.ndarray) -> tuple[bool, str | None]:
        if face.size < 15:
            return False, "invalid_face_data"
        confidence = float(face[14])
        x, y, width, height = (float(value) for value in face[:4])
        if not np.isfinite([confidence, x, y, width, height]).all():
            return False, "invalid_face_data"
        if confidence < 0.9:
            return False, "low_detection_confidence"
        if width < 64 or height < 64:
            return False, "face_too_small"
        if x < 0 or y < 0 or x + width > frame.shape[1] or y + height > frame.shape[0]:
            return False, "face_partially_outside_frame"

        landmarks = face[4:14].reshape(5, 2)
        if not np.all(np.isfinite(landmarks)):
            return False, "invalid_landmarks"

        left = max(0, int(y))
        top = max(0, int(x))
        right = min(frame.shape[0], int(y + height))
        bottom = min(frame.shape[1], int(x + width))
        crop = frame[left:right, top:bottom]
        if crop.size == 0:
            return False, "invalid_face_crop"
        try:
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        except Exception:
            return False, "quality_check_failed"
        if not np.isfinite(blur) or blur < 25.0:
            return False, "poor_focus"
        return True, None

    def detect_faces(self, image_bytes: bytes) -> dict[str, Any]:
        started = time.perf_counter()
        model_error = self._ensure_initialized()
        if model_error:
            return {
                **model_error,
                "face_count": 0,
                "processing_ms": round((time.perf_counter() - started) * 1000, 3),
            }

        decoded = self._decode_image(image_bytes)
        if decoded["status"] != "success":
            return {
                **decoded,
                "processing_ms": round((time.perf_counter() - started) * 1000, 3),
            }

        frame = decoded["frame"]
        try:
            self._detector.setInputSize((frame.shape[1], frame.shape[0]))
            _, faces = self._detector.detect(frame)
        except Exception:
            return {
                "status": "model_error",
                "face_count": 0,
                "processing_ms": round((time.perf_counter() - started) * 1000, 3),
                "message": "Face detection inference failed.",
            }

        faces = faces if faces is not None else np.empty((0, 15), dtype=np.float32)
        face_count = int(len(faces))
        if face_count == 0:
            status: RecognitionStatus = "no_face"
        elif face_count > 1:
            status = "multiple_faces"
        else:
            acceptable, reason = self._face_quality(frame, faces[0])
            if not acceptable:
                status = "poor_quality"
                return {
                    "status": status,
                    "face_count": 1,
                    "processing_ms": round((time.perf_counter() - started) * 1000, 3),
                    "reason": reason,
                }
            status = "unknown"

        return {
            "status": status,
            "face_count": face_count,
            "processing_ms": round((time.perf_counter() - started) * 1000, 3),
        }

    def extract_embedding(self, image_bytes: bytes) -> dict[str, Any]:
        started = time.perf_counter()
        model_error = self._ensure_initialized()
        if model_error:
            return {
                **model_error,
                "face_count": 0,
                "processing_ms": round((time.perf_counter() - started) * 1000, 3),
            }

        decoded = self._decode_image(image_bytes)
        if decoded["status"] != "success":
            return {
                **decoded,
                "processing_ms": round((time.perf_counter() - started) * 1000, 3),
            }

        frame = decoded["frame"]
        try:
            self._detector.setInputSize((frame.shape[1], frame.shape[0]))
            _, faces = self._detector.detect(frame)
        except Exception:
            return {
                "status": "model_error",
                "face_count": 0,
                "processing_ms": round((time.perf_counter() - started) * 1000, 3),
                "message": "Face detection inference failed.",
            }

        faces = faces if faces is not None else np.empty((0, 15), dtype=np.float32)
        face_count = int(len(faces))
        if face_count == 0:
            return {
                "status": "no_face",
                "face_count": 0,
                "processing_ms": round((time.perf_counter() - started) * 1000, 3),
            }
        if face_count > 1:
            return {
                "status": "multiple_faces",
                "face_count": face_count,
                "processing_ms": round((time.perf_counter() - started) * 1000, 3),
            }

        acceptable, reason = self._face_quality(frame, faces[0])
        if not acceptable:
            return {
                "status": "poor_quality",
                "face_count": 1,
                "processing_ms": round((time.perf_counter() - started) * 1000, 3),
                "reason": reason,
            }

        try:
            aligned = self._recognizer.alignCrop(frame, faces[0][4:14].reshape(5, 2))
            embedding = np.asarray(self._recognizer.feature(aligned), dtype=np.float32).reshape(-1)
        except Exception:
            return {
                "status": "model_error",
                "face_count": 1,
                "processing_ms": round((time.perf_counter() - started) * 1000, 3),
                "message": "Embedding inference failed.",
            }

        if embedding.size != self.EMBEDDING_DIMENSION:
            return {
                "status": "model_error",
                "face_count": 1,
                "processing_ms": round((time.perf_counter() - started) * 1000, 3),
                "message": "Embedding dimension is invalid.",
            }
        if not np.all(np.isfinite(embedding)):
            return {
                "status": "model_error",
                "face_count": 1,
                "processing_ms": round((time.perf_counter() - started) * 1000, 3),
                "message": "Embedding contains invalid values.",
            }

        norm = float(np.linalg.norm(embedding))
        if norm == 0.0 or not np.isfinite(norm):
            return {
                "status": "model_error",
                "face_count": 1,
                "processing_ms": round((time.perf_counter() - started) * 1000, 3),
                "message": "Embedding norm is invalid.",
            }

        normalized = embedding / norm
        return {
            "status": "success",
            "face_count": 1,
            "embedding": normalized,
            "embedding_dimension": self.EMBEDDING_DIMENSION,
            "normalized": True,
            "quality_score": round(float(faces[0][14]), 6),
            "processing_ms": round((time.perf_counter() - started) * 1000, 3),
        }

    def compare_embeddings(self, embedding_a: Any, embedding_b: Any) -> dict[str, Any]:
        for embedding in (embedding_a, embedding_b):
            if not isinstance(embedding, np.ndarray):
                return {"status": "model_error", "message": "Embedding must be a NumPy array."}
            if embedding.dtype.kind not in ("f", "i"):
                return {"status": "model_error", "message": "Embedding dtype is invalid."}
            if embedding.ndim != 1 or embedding.size != self.EMBEDDING_DIMENSION:
                return {"status": "model_error", "message": "Embedding dimension is invalid."}
            if not np.all(np.isfinite(embedding)):
                return {"status": "model_error", "message": "Embedding contains invalid values."}

        left = np.asarray(embedding_a, dtype=np.float64).reshape(-1)
        right = np.asarray(embedding_b, dtype=np.float64).reshape(-1)
        left_norm = float(np.linalg.norm(left))
        right_norm = float(np.linalg.norm(right))
        if left_norm == 0.0 or right_norm == 0.0:
            return {"status": "model_error", "message": "Zero-length embedding is invalid."}

        similarity = float(np.dot(left / left_norm, right / right_norm))
        similarity = float(np.clip(similarity, -1.0, 1.0))
        if not np.isfinite(similarity):
            return {"status": "model_error", "message": "Cosine similarity is invalid."}
        return {"status": "success", "similarity": similarity}

    def classify_similarity(self, similarity: float) -> dict[str, Any]:
        if not isinstance(similarity, (int, float, np.floating)):
            return {"status": "unknown", "classification": "unknown", "reason": "invalid_similarity"}
        score = float(similarity)
        if not np.isfinite(score) or score < -1.0 or score > 1.0:
            return {"status": "unknown", "classification": "unknown", "reason": "invalid_similarity"}
        if score >= self.matched_threshold:
            classification: RecognitionStatus = "matched"
        elif score >= self.uncertain_threshold:
            classification = "uncertain"
        else:
            classification = "unknown"
        return {
            "status": "success",
            "classification": classification,
            "thresholds": {
                "matched": self.matched_threshold,
                "uncertain": self.uncertain_threshold,
                "provisional": True,
            },
        }


face_recognition_service = FaceRecognitionService()

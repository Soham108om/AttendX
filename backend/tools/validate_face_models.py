from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import platform
import statistics
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
YUNET_PATH = ROOT / "models" / "face_detection" / "face_detection_yunet_2023mar.onnx"
SFACE_PATH = ROOT / "models" / "face_recognition" / "face_recognition_sface_2021dec.onnx"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def tensor_summary(tensor: Any) -> dict[str, Any]:
    import onnx

    dims = [
        dim.dim_value if dim.dim_value else dim.dim_param
        for dim in tensor.type.tensor_type.shape.dim
    ]
    return {
        "name": tensor.name,
        "type": onnx.TensorProto.DataType.Name(tensor.type.tensor_type.elem_type),
        "dims": dims,
    }


def inspect_onnx(path: Path) -> dict[str, Any]:
    import onnx

    model = onnx.load(str(path))
    onnx.checker.check_model(model)
    graph = model.graph
    return {
        "valid": True,
        "ir_version": model.ir_version,
        "opset": [
            {"domain": item.domain or "ai.onnx", "version": item.version}
            for item in model.opset_import
        ],
        "inputs": [tensor_summary(item) for item in graph.input],
        "outputs": [tensor_summary(item) for item in graph.output],
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def create_models(width: int = 640, height: int = 480):
    detector = cv2.FaceDetectorYN.create(
        str(YUNET_PATH),
        "",
        (width, height),
        score_threshold=0.9,
        nms_threshold=0.3,
        top_k=5000,
        backend_id=cv2.dnn.DNN_BACKEND_OPENCV,
        target_id=cv2.dnn.DNN_TARGET_CPU,
    )
    recognizer = cv2.FaceRecognizerSF.create(
        str(SFACE_PATH),
        "",
        backend_id=cv2.dnn.DNN_BACKEND_OPENCV,
        target_id=cv2.dnn.DNN_TARGET_CPU,
    )
    return detector, recognizer


def classify_faces(detector: cv2.FaceDetectorYN, frame: np.ndarray) -> dict[str, Any]:
    detector.setInputSize((frame.shape[1], frame.shape[0]))
    _, faces = detector.detect(frame)
    faces = faces if faces is not None else np.empty((0, 15), dtype=np.float32)
    if len(faces) == 0:
        return {"category": "no_face", "faces": faces}
    if len(faces) > 1:
        return {"category": "multiple_faces", "faces": faces}
    return {"category": "single_face", "faces": faces}


def extract_embedding(
    recognizer: cv2.FaceRecognizerSF,
    frame: np.ndarray,
    landmarks: np.ndarray,
) -> np.ndarray:
    aligned = recognizer.alignCrop(frame, landmarks)
    embedding = np.asarray(recognizer.feature(aligned), dtype=np.float32).reshape(-1)
    if embedding.size == 0 or not np.all(np.isfinite(embedding)):
        raise RuntimeError("SFace returned an invalid embedding")
    return embedding


def cosine_similarity(left: np.ndarray, right: np.ndarray) -> float:
    denominator = np.linalg.norm(left) * np.linalg.norm(right)
    if denominator == 0:
        return 0.0
    return float(np.dot(left, right) / denominator)


def benchmark(
    detector: cv2.FaceDetectorYN,
    recognizer: cv2.FaceRecognizerSF,
    iterations: int,
) -> dict[str, Any]:
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    aligned = np.zeros((112, 112, 3), dtype=np.uint8)
    detection_times = []
    recognition_times = []
    total_times = []

    for _ in range(iterations):
        start = time.perf_counter()
        detector.setInputSize((640, 480))
        _, faces = detector.detect(frame)
        detection_end = time.perf_counter()

        recognition_start = time.perf_counter()
        recognizer.feature(aligned)
        recognition_end = time.perf_counter()

        detection_times.append((detection_end - start) * 1000)
        recognition_times.append((recognition_end - recognition_start) * 1000)
        total_times.append((time.perf_counter() - start) * 1000)

    average_total = statistics.mean(total_times)
    return {
        "iterations": iterations,
        "detected_faces_in_synthetic_black_frame": 0
        if faces is None or len(faces) == 0
        else len(faces),
        "detection_ms_avg": round(statistics.mean(detection_times), 3),
        "recognition_ms_avg": round(statistics.mean(recognition_times), 3),
        "total_ms_avg": round(average_total, 3),
        "total_fps_avg": round(1000 / average_total, 2),
        "cpu_only": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Local CPU-only YuNet/SFace validation")
    parser.add_argument("--image", type=Path)
    parser.add_argument("--second-image", type=Path)
    parser.add_argument("--iterations", type=int, default=20)
    args = parser.parse_args()

    report: dict[str, Any] = {
        "python": platform.python_version(),
        "opencv": cv2.__version__,
        "numpy": importlib.metadata.version("numpy"),
        "cuda_enabled_devices": (
            cv2.cuda.getCudaEnabledDeviceCount()
            if hasattr(cv2, "cuda")
            else 0
        ),
        "yunet": inspect_onnx(YUNET_PATH),
        "sface": inspect_onnx(SFACE_PATH),
    }

    init_start = time.perf_counter()
    detector, recognizer = create_models()
    report["model_initialization_ms"] = round(
        (time.perf_counter() - init_start) * 1000,
        3,
    )

    embeddings = []
    if args.image:
        if not args.image.is_file():
            raise FileNotFoundError(args.image)
        frame = cv2.imread(str(args.image), cv2.IMREAD_COLOR)
        if frame is None:
            raise RuntimeError("Could not decode supplied image")
        result = classify_faces(detector, frame)
        report["first_image_category"] = result["category"]
        if result["category"] == "single_face":
            face = result["faces"][0]
            embedding = extract_embedding(
                recognizer,
                frame,
                face[4:14].reshape(5, 2),
            )
            embeddings.append(embedding)
            report["embedding_dimension"] = int(embedding.size)
            report["embedding_finite"] = bool(np.all(np.isfinite(embedding)))

        if args.second_image:
            if not args.second_image.is_file():
                raise FileNotFoundError(args.second_image)
            second = cv2.imread(str(args.second_image), cv2.IMREAD_COLOR)
            if second is None:
                raise RuntimeError("Could not decode second image")
            second_result = classify_faces(detector, second)
            report["second_image_category"] = second_result["category"]
            if second_result["category"] == "single_face" and embeddings:
                face = second_result["faces"][0]
                second_embedding = extract_embedding(
                    recognizer,
                    second,
                    face[4:14].reshape(5, 2),
                )
                report["cosine_similarity"] = round(
                    cosine_similarity(embeddings[0], second_embedding),
                    6,
                )
    else:
        report["first_image_category"] = "not_tested"
        report["limitation"] = "No consented face image was supplied."

    report["benchmark"] = benchmark(detector, recognizer, max(args.iterations, 1))
    print("  python:", report["python"])
    print("  opencv:", report["opencv"])
    print("  numpy:", report["numpy"])
    print("  cuda_enabled_devices:", report["cuda_enabled_devices"])
    print("  model_initialization_ms:", report["model_initialization_ms"])
    print("  models_loaded: true")
    print("  yuNet_input:", report["yunet"]["inputs"][0])
    print("  yuNet_outputs:", [
        item["name"] for item in report["yunet"]["outputs"]
    ])
    print("  sFace_input:", next(
        (item for item in report["sface"]["inputs"] if item["name"] == "data"),
        report["sface"]["inputs"][0],
    ))
    print("  sFace_output:", report["sface"]["outputs"])
    print("  category:", report["first_image_category"])
    print("  benchmark:", report["benchmark"])
    if "embedding_dimension" in report:
        print("  embedding_dimension:", report["embedding_dimension"])
    if "cosine_similarity" in report:
        print("  cosine_similarity:", report["cosine_similarity"])
    if "limitation" in report:
        print("  limitation:", report["limitation"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

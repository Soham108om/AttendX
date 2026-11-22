from __future__ import annotations

import argparse
import itertools
import json
import math
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path, PureWindowsPath
from typing import Any, Sequence

import numpy as np

from app.services.face_recognition_service import (
    FaceRecognitionService,
    face_recognition_service,
)


MAX_MANIFEST_BYTES = 2 * 1024 * 1024
MAX_SAMPLES = 2000
ALLOWED_IMAGE_EXTENSIONS = {".bmp", ".jpeg", ".jpg", ".png", ".tif", ".tiff"}
LABEL_PATTERN = re.compile(r"[A-Za-z0-9_-]{1,64}\Z")
RECORD_STATUSES = {"present", "late", "absent", "excused"}
FAILURE_CATEGORIES = (
    "invalid_image",
    "no_face",
    "multiple_faces",
    "poor_quality",
    "model_error",
    "invalid_embedding",
)


class EvaluationError(ValueError):
    pass


@dataclass(frozen=True)
class EvaluationSample:
    label: str
    image_path: Path


def _unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key.")
        result[key] = value
    return result


def load_consented_dataset(
    manifest_path: Path,
    max_image_bytes: int = FaceRecognitionService.DEFAULT_MAX_IMAGE_BYTES,
) -> list[EvaluationSample]:
    try:
        manifest_path = manifest_path.resolve(strict=True)
        if not manifest_path.is_file() or manifest_path.stat().st_size > MAX_MANIFEST_BYTES:
            raise EvaluationError("Dataset manifest is missing or too large.")
        manifest = json.loads(
            manifest_path.read_text(encoding="utf-8"),
            object_pairs_hook=_unique_json_object,
        )
    except EvaluationError:
        raise
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError):
        raise EvaluationError("Dataset manifest is not a readable, valid JSON file.") from None

    if not isinstance(manifest, dict) or set(manifest) != {"consent_confirmed", "samples"}:
        raise EvaluationError("Dataset manifest has an unsupported structure.")
    if manifest["consent_confirmed"] is not True:
        raise EvaluationError("Dataset manifest must confirm evaluation consent.")
    rows = manifest["samples"]
    if not isinstance(rows, list) or len(rows) > MAX_SAMPLES:
        raise EvaluationError("Dataset sample list is invalid or exceeds the supported limit.")

    dataset_root = manifest_path.parent.resolve()
    samples = []
    label_counts: Counter[str] = Counter()
    label_spellings: dict[str, str] = {}
    used_images = set()

    for row in rows:
        if not isinstance(row, dict) or set(row) != {"label", "image"}:
            raise EvaluationError("Each sample must contain only a label and relative image path.")

        label = row["label"]
        image_ref = row["image"]
        if (
            not isinstance(label, str)
            or not LABEL_PATTERN.fullmatch(label)
            or not isinstance(image_ref, str)
            or not image_ref
            or image_ref.strip() != image_ref
            or "\x00" in image_ref
        ):
            raise EvaluationError("Dataset labels or image references are invalid.")

        folded_label = label.casefold()
        previous_spelling = label_spellings.setdefault(folded_label, label)
        if previous_spelling != label:
            raise EvaluationError("Dataset contains ambiguous case-insensitive labels.")

        relative_path = Path(image_ref)
        windows_path = PureWindowsPath(image_ref)
        if (
            relative_path.is_absolute()
            or windows_path.is_absolute()
            or windows_path.drive
            or ".." in relative_path.parts
            or ".." in windows_path.parts
        ):
            raise EvaluationError("Image references must stay inside the dataset directory.")

        try:
            image_path = (dataset_root / relative_path).resolve(strict=True)
            image_size = image_path.stat().st_size
        except (OSError, RuntimeError, ValueError):
            raise EvaluationError("A dataset image is missing or unreadable.") from None
        if dataset_root not in image_path.parents or not image_path.is_file():
            raise EvaluationError("Image references must resolve to files inside the dataset directory.")
        if image_path.suffix.lower() not in ALLOWED_IMAGE_EXTENSIONS or image_size > max_image_bytes:
            raise EvaluationError("A dataset image has an unsupported format or size.")

        normalized_path = str(image_path).casefold()
        if normalized_path in used_images:
            raise EvaluationError("Dataset image paths must be unique.")
        used_images.add(normalized_path)
        samples.append(EvaluationSample(label=label, image_path=image_path))
        label_counts[label] += 1

    if len(label_counts) < 2 or any(count < 2 for count in label_counts.values()):
        raise EvaluationError("Dataset needs at least two labels and two images per label.")
    return samples


def parse_thresholds(raw: str, uncertain_threshold: float) -> list[float]:
    try:
        thresholds = [float(value.strip()) for value in raw.split(",")]
    except (AttributeError, ValueError):
        raise EvaluationError("Thresholds must be comma-separated numbers.") from None
    if (
        not thresholds
        or any(not math.isfinite(value) for value in thresholds)
        or any(value < uncertain_threshold or value > 1.0 for value in thresholds)
    ):
        raise EvaluationError("Thresholds must be finite values from the uncertain boundary through 1.")
    return sorted(set(thresholds))


def default_thresholds(recognition_service: FaceRecognitionService) -> list[float]:
    uncertain = recognition_service.uncertain_threshold
    matched = recognition_service.matched_threshold
    return sorted({
        uncertain,
        (uncertain + matched) / 2,
        matched,
        min(1.0, matched + 0.05),
        min(1.0, matched + 0.10),
    })


def threshold_metrics(
    genuine_scores: Sequence[float],
    impostor_scores: Sequence[float],
    matched_threshold: float,
    uncertain_threshold: float,
) -> dict[str, Any]:
    if (
        not math.isfinite(matched_threshold)
        or not math.isfinite(uncertain_threshold)
        or matched_threshold < uncertain_threshold
        or matched_threshold > 1.0
        or uncertain_threshold < -1.0
    ):
        raise EvaluationError("Threshold configuration is invalid.")

    classifier = FaceRecognitionService(
        matched_threshold=matched_threshold,
        uncertain_threshold=uncertain_threshold,
    )

    def outcomes(scores: Sequence[float]) -> Counter[str]:
        result: Counter[str] = Counter()
        for score in scores:
            classification = classifier.classify_similarity(float(score))["classification"]
            if classification == "unknown":
                classification = "rejected"
            result[classification] += 1
        return result

    genuine = outcomes(genuine_scores)
    impostor = outcomes(impostor_scores)
    genuine_count = len(genuine_scores)
    impostor_count = len(impostor_scores)
    genuine_matched = genuine["matched"]
    impostor_matched = impostor["matched"]
    rejected_genuine = genuine["uncertain"] + genuine["rejected"]

    return {
        "threshold": round(matched_threshold, 6),
        "genuine_pairs": {
            "count": genuine_count,
            "matched": genuine_matched,
            "uncertain": genuine["uncertain"],
            "rejected": genuine["rejected"],
        },
        "impostor_pairs": {
            "count": impostor_count,
            "matched": impostor_matched,
            "uncertain": impostor["uncertain"],
            "rejected": impostor["rejected"],
        },
        "far": round(impostor_matched / impostor_count, 6) if impostor_count else None,
        "frr": round(rejected_genuine / genuine_count, 6) if genuine_count else None,
        "tar": round(genuine_matched / genuine_count, 6) if genuine_count else None,
    }


def equal_error_rate(
    genuine_scores: Sequence[float],
    impostor_scores: Sequence[float],
) -> dict[str, float] | None:
    if not genuine_scores or not impostor_scores:
        return None

    scores = sorted(set(float(score) for score in (*genuine_scores, *impostor_scores)))
    thresholds = [
        math.nextafter(scores[0], -math.inf),
        *scores,
        math.nextafter(scores[-1], math.inf),
    ]
    points = []
    for threshold in thresholds:
        far = sum(score >= threshold for score in impostor_scores) / len(impostor_scores)
        frr = sum(score < threshold for score in genuine_scores) / len(genuine_scores)
        points.append((threshold, far, frr))

    for left, right in zip(points, points[1:]):
        left_difference = left[1] - left[2]
        right_difference = right[1] - right[2]
        if left_difference == 0:
            return {"threshold": round(left[0], 6), "eer": round(left[1], 6)}
        if left_difference * right_difference < 0:
            fraction = left_difference / (left_difference - right_difference)
            far = left[1] + fraction * (right[1] - left[1])
            frr = left[2] + fraction * (right[2] - left[2])
            threshold = left[0] + fraction * (right[0] - left[0])
            return {
                "threshold": round(threshold, 6),
                "eer": round((far + frr) / 2, 6),
            }

    closest = min(points, key=lambda point: abs(point[1] - point[2]))
    return {
        "threshold": round(closest[0], 6),
        "eer": round((closest[1] + closest[2]) / 2, 6),
    }


def _failure_category(status_value: Any) -> str:
    if status_value in FAILURE_CATEGORIES:
        return status_value
    return "model_error"


def evaluate_dataset(
    manifest_path: Path,
    thresholds: Sequence[float],
    recognition_service: FaceRecognitionService = face_recognition_service,
) -> dict[str, Any]:
    samples = load_consented_dataset(
        manifest_path,
        max_image_bytes=recognition_service.max_image_bytes,
    )
    thresholds = parse_thresholds(
        ",".join(str(value) for value in thresholds),
        recognition_service.uncertain_threshold,
    )

    embeddings_by_label: dict[str, list[np.ndarray]] = defaultdict(list)
    failures: Counter[str] = Counter()
    for category in FAILURE_CATEGORIES:
        failures[category] = 0

    for sample in samples:
        try:
            with sample.image_path.open("rb") as image_file:
                image_bytes = image_file.read(recognition_service.max_image_bytes + 1)
        except OSError:
            failures["invalid_image"] += 1
            continue
        if not image_bytes or len(image_bytes) > recognition_service.max_image_bytes:
            failures["invalid_image"] += 1
            continue

        try:
            extraction = recognition_service.extract_embedding(image_bytes)
        except Exception:
            failures["model_error"] += 1
            continue
        if not isinstance(extraction, dict) or extraction.get("status") != "success":
            failures[_failure_category(extraction.get("status") if isinstance(extraction, dict) else None)] += 1
            continue

        embedding = extraction.get("embedding")
        if (
            not isinstance(embedding, np.ndarray)
            or embedding.shape != (FaceRecognitionService.EMBEDDING_DIMENSION,)
            or not np.all(np.isfinite(embedding))
        ):
            failures["invalid_embedding"] += 1
            continue
        norm = float(np.linalg.norm(embedding))
        if norm == 0.0 or not math.isfinite(norm) or abs(norm - 1.0) > 1e-3:
            failures["invalid_embedding"] += 1
            continue
        embeddings_by_label[sample.label].append(embedding)

    genuine_scores = []
    impostor_scores = []
    comparison_errors = 0

    def compare(left: np.ndarray, right: np.ndarray) -> float | None:
        nonlocal comparison_errors
        try:
            result = recognition_service.compare_embeddings(left, right)
        except Exception:
            comparison_errors += 1
            return None
        if not isinstance(result, dict) or result.get("status") != "success":
            comparison_errors += 1
            return None
        score = result.get("similarity")
        if (
            isinstance(score, bool)
            or not isinstance(score, (int, float, np.number))
            or not math.isfinite(float(score))
            or not -1.0 <= float(score) <= 1.0
        ):
            comparison_errors += 1
            return None
        return float(score)

    label_groups = list(embeddings_by_label.values())
    for group in label_groups:
        for left, right in itertools.combinations(group, 2):
            score = compare(left, right)
            if score is not None:
                genuine_scores.append(score)

    for left_group, right_group in itertools.combinations(label_groups, 2):
        for left in left_group:
            for right in right_group:
                score = compare(left, right)
                if score is not None:
                    impostor_scores.append(score)

    return {
        "model": "YuNet/SFace via the production FaceRecognitionService",
        "sample_count": len(samples),
        "identity_count": len({sample.label for sample in samples}),
        "successful_embeddings": sum(len(group) for group in label_groups),
        "embedding_failures": dict(failures),
        "genuine_pair_count": len(genuine_scores),
        "impostor_pair_count": len(impostor_scores),
        "comparison_errors": comparison_errors,
        "uncertain_threshold": recognition_service.uncertain_threshold,
        "thresholds_provisional": True,
        "threshold_results": [
            threshold_metrics(
                genuine_scores,
                impostor_scores,
                threshold,
                recognition_service.uncertain_threshold,
            )
            for threshold in thresholds
        ],
        "eer": equal_error_rate(genuine_scores, impostor_scores),
    }


def main(
    argv: Sequence[str] | None = None,
    recognition_service: FaceRecognitionService = face_recognition_service,
) -> int:
    parser = argparse.ArgumentParser(
        description="Offline YuNet/SFace evaluation of an explicitly consented image dataset."
    )
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument(
        "--confirm-consented-data",
        action="store_true",
        required=True,
        help="Confirm that every participant consented to this offline evaluation.",
    )

    def threshold_argument(raw: str) -> list[float]:
        try:
            return parse_thresholds(raw, recognition_service.uncertain_threshold)
        except EvaluationError as exc:
            raise argparse.ArgumentTypeError(str(exc)) from exc

    parser.add_argument(
        "--thresholds",
        type=threshold_argument,
        default=default_thresholds(recognition_service),
        help="Comma-separated matched thresholds; the existing uncertain boundary remains fixed.",
    )
    args = parser.parse_args(argv)

    try:
        report = evaluate_dataset(args.manifest, args.thresholds, recognition_service)
    except EvaluationError as exc:
        print(f"Evaluation refused: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

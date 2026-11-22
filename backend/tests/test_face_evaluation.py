import json

import numpy as np
import pytest

from tools.evaluate_face_recognition import (
    EvaluationError,
    equal_error_rate,
    evaluate_dataset,
    load_consented_dataset,
    main,
    parse_thresholds,
    threshold_metrics,
)


class SyntheticRecognitionService:
    max_image_bytes = 1024
    matched_threshold = 0.363
    uncertain_threshold = 0.300

    def __init__(self, embeddings):
        self.embeddings = embeddings

    def extract_embedding(self, image_bytes):
        embedding = self.embeddings.get(image_bytes)
        if embedding is None:
            return {"status": "no_face"}
        return {"status": "success", "embedding": embedding}

    def compare_embeddings(self, left, right):
        similarity = float(np.dot(left, right) / (np.linalg.norm(left) * np.linalg.norm(right)))
        return {"status": "success", "similarity": similarity}


def _unit_vector(index):
    vector = np.zeros(128, dtype=np.float32)
    vector[index] = 1.0
    return vector


def write_dataset(tmp_path, rows, consent_confirmed=True):
    embeddings = {}
    root = tmp_path.resolve()
    for row in rows:
        image_path = tmp_path / row["image"]
        if not image_path.resolve().is_relative_to(root):
            continue
        image_path.parent.mkdir(parents=True, exist_ok=True)
        image_path.write_bytes(row["image"].encode("ascii"))
        embeddings[row["image"].encode("ascii")] = (
            _unit_vector(0) if row["label"] == "participant_001" else _unit_vector(1)
        )
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(
        json.dumps({
            "consent_confirmed": consent_confirmed,
            "samples": rows,
        }),
        encoding="utf-8",
    )
    return manifest_path, embeddings


def valid_rows():
    return [
        {"label": "participant_001", "image": "sample-001.jpg"},
        {"label": "participant_001", "image": "sample-002.jpg"},
        {"label": "participant_002", "image": "sample-003.jpg"},
        {"label": "participant_002", "image": "sample-004.jpg"},
    ]


def test_evaluator_computes_genuine_impostor_metrics_without_identifiers(tmp_path):
    manifest, embeddings = write_dataset(tmp_path, valid_rows())

    report = evaluate_dataset(
        manifest,
        [0.300, 0.363],
        SyntheticRecognitionService(embeddings),
    )

    assert report["sample_count"] == 4
    assert report["identity_count"] == 2
    assert report["genuine_pair_count"] == 2
    assert report["impostor_pair_count"] == 4
    assert report["threshold_results"][1]["far"] == 0.0
    assert report["threshold_results"][1]["frr"] == 0.0
    assert report["threshold_results"][1]["tar"] == 1.0
    assert report["eer"]["eer"] == 0.0
    serialized = json.dumps(report)
    assert "participant_001" not in serialized
    assert "sample-001.jpg" not in serialized
    assert json.dumps(embeddings[b"sample-001.jpg"].tolist()) not in serialized


def test_threshold_metrics_distinguishes_matched_uncertain_and_rejected():
    result = threshold_metrics(
        genuine_scores=[0.8, 0.32, 0.2],
        impostor_scores=[0.8, 0.32, 0.2],
        matched_threshold=0.363,
        uncertain_threshold=0.300,
    )

    assert result["genuine_pairs"] == {
        "count": 3,
        "matched": 1,
        "uncertain": 1,
        "rejected": 1,
    }
    assert result["impostor_pairs"] == {
        "count": 3,
        "matched": 1,
        "uncertain": 1,
        "rejected": 1,
    }
    assert result["far"] == pytest.approx(1 / 3)
    assert result["frr"] == pytest.approx(2 / 3)
    assert result["tar"] == pytest.approx(1 / 3)


def test_equal_error_rate_interpolates_crossing():
    assert equal_error_rate([0.8, 0.4], [0.6, 0.2]) == {
        "threshold": 0.6,
        "eer": 0.5,
    }


def test_equal_error_rate_is_unavailable_without_both_pair_types():
    assert equal_error_rate([0.8], []) is None
    assert equal_error_rate([], [0.2]) is None


def test_manifest_requires_explicit_consent_confirmation(tmp_path):
    manifest, _ = write_dataset(tmp_path, valid_rows(), consent_confirmed=False)

    with pytest.raises(EvaluationError, match="consent"):
        load_consented_dataset(manifest)


def test_manifest_rejects_case_ambiguous_labels(tmp_path):
    rows = [
        {"label": "participant_001", "image": "a.jpg"},
        {"label": "participant_001", "image": "b.jpg"},
        {"label": "PARTICIPANT_001", "image": "c.jpg"},
        {"label": "PARTICIPANT_001", "image": "d.jpg"},
    ]
    manifest, _ = write_dataset(tmp_path, rows)

    with pytest.raises(EvaluationError, match="ambiguous"):
        load_consented_dataset(manifest)


def test_manifest_rejects_non_opaque_label_values(tmp_path):
    rows = [
        {"label": "participant one", "image": "a.jpg"},
        {"label": "participant one", "image": "b.jpg"},
        {"label": "participant_002", "image": "c.jpg"},
        {"label": "participant_002", "image": "d.jpg"},
    ]
    manifest, _ = write_dataset(tmp_path, rows)

    with pytest.raises(EvaluationError, match="invalid"):
        load_consented_dataset(manifest)


def test_manifest_rejects_duplicate_image_references(tmp_path):
    rows = [
        {"label": "participant_001", "image": "same.jpg"},
        {"label": "participant_001", "image": "same.jpg"},
        {"label": "participant_002", "image": "other-a.jpg"},
        {"label": "participant_002", "image": "other-b.jpg"},
    ]
    manifest, _ = write_dataset(tmp_path, rows)

    with pytest.raises(EvaluationError, match="unique"):
        load_consented_dataset(manifest)


def test_manifest_rejects_path_escape(tmp_path):
    rows = [
        {"label": "participant_001", "image": "a.jpg"},
        {"label": "participant_001", "image": "b.jpg"},
        {"label": "participant_002", "image": "../outside.jpg"},
        {"label": "participant_002", "image": "d.jpg"},
    ]
    manifest, _ = write_dataset(tmp_path, rows)

    with pytest.raises(EvaluationError, match="inside"):
        load_consented_dataset(manifest)


def test_manifest_requires_two_samples_per_identity(tmp_path):
    rows = [
        {"label": "participant_001", "image": "a.jpg"},
        {"label": "participant_001", "image": "b.jpg"},
        {"label": "participant_002", "image": "c.jpg"},
    ]
    manifest, _ = write_dataset(tmp_path, rows)

    with pytest.raises(EvaluationError, match="two images"):
        load_consented_dataset(manifest)


def test_thresholds_must_respect_existing_uncertain_boundary():
    assert parse_thresholds("0.363,0.300,0.5", 0.300) == [0.3, 0.363, 0.5]
    with pytest.raises(EvaluationError):
        parse_thresholds("0.29,0.4", 0.300)
    with pytest.raises(EvaluationError):
        parse_thresholds("nan,0.4", 0.300)


def test_cli_requires_explicit_consent_flag(tmp_path):
    manifest, embeddings = write_dataset(tmp_path, valid_rows())

    with pytest.raises(SystemExit) as exc:
        main(["--manifest", str(manifest)], SyntheticRecognitionService(embeddings))

    assert exc.value.code == 2


def test_cli_emits_only_aggregate_report(tmp_path, capsys):
    manifest, embeddings = write_dataset(tmp_path, valid_rows())

    exit_code = main(
        [
            "--manifest",
            str(manifest),
            "--confirm-consented-data",
            "--thresholds",
            "0.300,0.363",
        ],
        SyntheticRecognitionService(embeddings),
    )

    output = capsys.readouterr().out
    assert exit_code == 0
    assert '"genuine_pair_count": 2' in output
    assert '"impostor_pair_count": 4' in output
    assert "participant_001" not in output
    assert "sample-001.jpg" not in output

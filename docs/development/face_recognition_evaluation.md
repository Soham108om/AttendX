# Offline face-recognition evaluation

`backend/tools/evaluate_face_recognition.py` evaluates YuNet/SFace embeddings from a local, explicitly consented image dataset. It uses the production `FaceRecognitionService` for model loading, image decoding, face checks, embedding extraction, cosine comparison, and threshold classification. It does not import Supabase clients, query biometric tables, contact the network, or write evaluation results to disk.

## Dataset preparation

Obtain explicit consent from every participant for offline face-recognition evaluation before collecting or using any images. Keep the consent records outside this tool and do not put names, emails, student IDs, or consent documents in the dataset manifest. Use opaque, stable labels to identify which samples belong to the same person.

Create a private local directory with `manifest.json` and one or more local image files. Include at least two distinct labels and at least two distinct images for each label. Use one clearly visible face per image; the existing YuNet/SFace service will count and reject invalid, multi-face, poor-quality, or undecodable images in aggregate.

Example `manifest.json`:

```json
{
  "consent_confirmed": true,
  "samples": [
    { "label": "participant_001", "image": "participant_001_01.jpg" },
    { "label": "participant_001", "image": "participant_001_02.jpg" },
    { "label": "participant_002", "image": "participant_002_01.jpg" },
    { "label": "participant_002", "image": "participant_002_02.jpg" }
  ]
}
```

Labels must be opaque ASCII identifiers containing only letters, digits, `_`, or `-`; labels that differ only by case are rejected. Image paths must be unique, relative to the manifest directory, remain inside that directory, and use JPG/JPEG, PNG, BMP, TIF, or TIFF. Each image must be no larger than the production service's configured 10 MiB image limit. The manifest accepts only the consent flag and sample label/image pairs; additional fields are rejected.

The consent flag is an operator attestation, not a consent-management system. The command also requires an explicit `--confirm-consented-data` option. Dataset preparation and use remain the operator's responsibility.

## Run

From the `backend` directory, with the existing backend virtual environment and local YuNet/SFace model files available:

```powershell
.\.venv\Scripts\python.exe -m tools.evaluate_face_recognition `
  --manifest "C:\private\attendx-evaluation\manifest.json" `
  --confirm-consented-data `
  --thresholds 0.300,0.330,0.363,0.400,0.450,0.500
```

The `--thresholds` values are candidate **matched** thresholds; each must be at least the existing uncertain boundary (`0.300`) and at most `1.0`. If omitted, the tool derives a small grid around the current service thresholds (`0.363` matched and `0.300` uncertain). Production thresholds are not modified.

The tool prints one JSON aggregate report. It does not print or save labels, image paths, image bytes, embeddings, or per-pair scores. Keep the dataset on approved local storage, do not commit it, and delete it according to the consent and retention policy.

## Metrics and interpretation

- **Matched:** similarity is at or above the candidate matched threshold.
- **Uncertain:** similarity is at or above the existing uncertain threshold but below the candidate matched threshold.
- **Rejected:** similarity is below the uncertain threshold (`FaceRecognitionService` calls this `unknown`).
- **FAR:** impostor pairs classified as matched divided by all valid impostor pairs. Uncertain impostor pairs are not accepted.
- **FRR:** genuine pairs classified uncertain or rejected divided by all valid genuine pairs.
- **TAR:** genuine pairs classified matched divided by all valid genuine pairs.
- **EER:** the interpolated point where FAR and FRR are equal, calculated from all valid pair scores when both pair types exist. EER is a summary statistic, not a recommended operating threshold.

Genuine pairs contain two samples with the same label; impostor pairs contain samples with different labels. Pair-level outcomes are not statistically independent when images are reused in multiple pairs. Embedding failures and comparison errors are reported as aggregate counts and excluded from pair metrics. A metric is `null` when the required comparison set is empty.

This tool does not establish liveness, spoof resistance, demographic fairness, or production performance. Use a sufficiently representative, consented, held-out dataset and review sample counts and failure rates before interpreting a threshold. Results do not automatically change or recommend production settings.

"""FishTongue's short-lived, offline PanPhon adapter (NDJSON protocol v1)."""
from __future__ import annotations

import json
import pathlib
import sys
import unicodedata
from typing import Any

# The Rust supervisor always speaks UTF-8 NDJSON. Windows otherwise lets the
# child process inherit the active ANSI code page, corrupting IPA symbols such
# as ə, ʃ, ŋ and ɡ before PanPhon sees them.
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROTOCOL_VERSION = 1
MAX_CODEPOINTS = 128
MAX_TARGETS = 512
MAX_IPA_BATCH = 512

try:
    import panphon  # type: ignore
    # PanPhon 0.22.2 opens its packaged CSV files without an explicit encoding.
    # Windows otherwise uses the active ANSI code page (for example GBK), while
    # the files are UTF-8. Limit the override to FeatureTable initialization.
    _original_path_open = pathlib.Path.open

    def _utf8_path_open(path: pathlib.Path, mode: str = "r", buffering: int = -1,
                        encoding: str | None = None, errors: str | None = None,
                        newline: str | None = None):
        if "b" not in mode and encoding is None:
            encoding = "utf-8"
        return _original_path_open(path, mode, buffering, encoding, errors, newline)

    pathlib.Path.open = _utf8_path_open
    try:
        _FEATURES = panphon.FeatureTable()
    finally:
        pathlib.Path.open = _original_path_open
    PANPHON_VERSION = getattr(panphon, "__version__", "0.22.2")
    _STARTUP_ERROR = ""
except Exception as exc:  # dependency diagnostics contain no project or user data
    _FEATURES = None
    PANPHON_VERSION = "unavailable"
    _STARTUP_ERROR = f"{type(exc).__name__}: {exc}"


def _segments(ipa: str) -> list[str]:
    value = unicodedata.normalize("NFC", ipa.strip().strip("/[]"))
    if len(value) > MAX_CODEPOINTS:
        raise ValueError("IPA_TOO_LONG")
    if _FEATURES is None:
        raise RuntimeError("PANPHON_UNAVAILABLE")
    return list(_FEATURES.ipa_segs(value))


def validate_ipa(payload: dict[str, Any]) -> dict[str, Any]:
    ipa = str(payload.get("ipa", ""))
    segments = _segments(ipa)
    normalized = unicodedata.normalize("NFD", ipa.strip().strip("/[]"))
    safe_segments = list(_FEATURES.segs_safe(normalized, normalize=False))
    unknown = [
        {"symbol": symbol, "position": index}
        for index, symbol in enumerate(safe_segments)
        if not _FEATURES.seg_known(symbol, normalize=False)
    ]
    return {
        "valid": bool(segments) and bool(_FEATURES.validate_word(normalized, normalize=False)),
        "segments": segments,
        "unknown": unknown,
    }


def validate_ipas(payload: dict[str, Any]) -> list[dict[str, Any]]:
    values = payload.get("ipas", [])
    if not isinstance(values, list) or len(values) > MAX_IPA_BATCH:
        raise ValueError("INVALID_IPA_BATCH")
    return [validate_ipa({"ipa": str(value)}) for value in values]


def describe_segments(payload: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for segment in _segments(str(payload.get("ipa", ""))):
        vector = _FEATURES.word_fts(segment)[0]
        result.append({"segment": segment, "features": dict(vector.items())})
    return result


def rank_segment_mappings(payload: dict[str, Any]) -> list[dict[str, Any]]:
    source = _segments(str(payload.get("sourceIpa", "")))
    targets = payload.get("targetPhonemes", [])
    if not isinstance(targets, list) or not targets or len(targets) > MAX_TARGETS:
        raise ValueError("INVALID_TARGET_PHONEMES")
    limit = max(1, min(int(payload.get("limit", 10)), 10))
    raw_weights = payload.get("distanceWeights", {})
    weights = raw_weights if isinstance(raw_weights, dict) else {}
    output: list[dict[str, Any]] = []
    for source_segment in source:
        ranked = []
        for order, target in enumerate(targets):
            target_segments = _segments(str(target))
            if len(target_segments) != 1:
                continue
            source_features = dict(_FEATURES.word_fts(source_segment)[0].items())
            target_features = dict(_FEATURES.word_fts(target_segments[0])[0].items())
            weighted_total = 0.0
            weight_total = 0.0
            for feature, source_value in source_features.items():
                weight = max(0.0, float(weights.get(feature, 1.0)))
                weighted_total += abs(source_value - target_features.get(feature, 0)) * weight
                weight_total += 2.0 * weight
            distance = weighted_total / weight_total if weight_total else 0.0
            ranked.append((distance, order, target_segments[0]))
        for distance, _, target in sorted(ranked)[:limit]:
            output.append({"source": source_segment, "target": target, "distance": distance})
    return output


HANDLERS = {
    "validate_ipa": validate_ipa,
    "validate_ipas": validate_ipas,
    "describe_segments": describe_segments,
    "rank_segment_mappings": rank_segment_mappings,
}


def main() -> int:
    ready = {
        "event": "ready",
        "protocolVersion": PROTOCOL_VERSION,
        "panphonVersion": PANPHON_VERSION,
    }
    sys.stdout.write(json.dumps(ready, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()
    for raw in sys.stdin:
        message: dict[str, Any] = {}
        try:
            message = json.loads(raw)
            if message.get("protocolVersion") != PROTOCOL_VERSION:
                raise ValueError("PROTOCOL_MISMATCH")
            nonce = message.get("nonce")
            method = message.get("method")
            if not isinstance(nonce, str) or not nonce or method not in HANDLERS:
                raise ValueError("INVALID_REQUEST")
            result = HANDLERS[method](message.get("payload") or {})
            response = {"nonce": nonce, "ok": True, "protocolVersion": 1,
                        "panphonVersion": PANPHON_VERSION, "result": result}
        except Exception as exc:
            error_code = "PANPHON_UNAVAILABLE" if str(exc) == "PANPHON_UNAVAILABLE" else str(exc)
            error_message = _STARTUP_ERROR if error_code == "PANPHON_UNAVAILABLE" else "Analysis request failed"
            response = {"nonce": message.get("nonce"),
                        "ok": False, "protocolVersion": 1,
                        "error": {"code": error_code, "message": error_message}}
        sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

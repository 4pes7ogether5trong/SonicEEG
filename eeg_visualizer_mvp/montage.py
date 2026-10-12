from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class ChannelLocation:
    region: str
    hemisphere: str
    angle_rad: float


# Deliberately abstract, stable ordering: this is a signal map, not a head plot.
_ORDER = (
    "FP1", "F7", "F3", "FZ", "FP2", "F4", "F8", "T3", "C3", "CZ",
    "C4", "T4", "T5", "P3", "PZ", "P4", "T6", "O1", "O2",
)

_ALIASES = {"T7": "T3", "T8": "T4", "P7": "T5", "P8": "T6"}

_REGIONS: Dict[str, str] = {
    "FP1": "frontopolar", "FP2": "frontopolar",
    "F7": "frontal", "F3": "frontal", "FZ": "frontal", "F4": "frontal", "F8": "frontal",
    "T3": "temporal", "T4": "temporal", "T5": "posterior-temporal", "T6": "posterior-temporal",
    "C3": "central", "CZ": "central", "C4": "central",
    "P3": "parietal", "PZ": "parietal", "P4": "parietal",
    "O1": "occipital", "O2": "occipital",
}


def canonical_channel_name(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]", "", name).upper()
    for prefix in ("EEG",):
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix):]
    for suffix in ("REF", "LE", "RE", "AVG"):
        if cleaned.endswith(suffix):
            cleaned = cleaned[:-len(suffix)]
    return _ALIASES.get(cleaned, cleaned)


def locate_channel(name: str, fallback_index: int = 0, fallback_count: int = 1) -> ChannelLocation:
    canonical = canonical_channel_name(name)
    if canonical in _ORDER:
        idx = _ORDER.index(canonical)
        region = _REGIONS[canonical]
        if canonical.endswith("Z"):
            hemisphere = "midline"
        elif canonical[-1:].isdigit() and int(canonical[-1]) % 2:
            hemisphere = "left"
        else:
            hemisphere = "right"
        return ChannelLocation(region, hemisphere, 2.0 * math.pi * idx / len(_ORDER) - math.pi / 2.0)

    count = max(1, fallback_count)
    return ChannelLocation(
        "unknown",
        "unknown",
        2.0 * math.pi * fallback_index / count - math.pi / 2.0,
    )


STANDARD_1020_CHANNELS = tuple(name.title().replace("Z", "z") for name in _ORDER)

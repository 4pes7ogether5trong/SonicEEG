from __future__ import annotations

import wave
from pathlib import Path
from typing import Dict, Iterable

import numpy as np

from ..model import ChannelFeature, SignalBlock, VisualizationFrame


def _quadrant(channel: ChannelFeature) -> Iterable[str]:
    posterior = channel.region in {"parietal", "posterior-temporal", "occipital"}
    vertical = "B" if posterior else "T"
    if channel.hemisphere == "left":
        return (vertical + "L",)
    if channel.hemisphere == "right":
        return (vertical + "R",)
    return (vertical + "L", vertical + "R")


class LegacySonificationConsumer:
    """Optional adapter into SonicEEG's original four-quadrant audio engine."""

    def __init__(self, output_dir: Path | str) -> None:
        from sonic_eeg_prototype.utils.config import AppConfig

        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.config = AppConfig(self.output_dir / "legacy_runtime")

    def consume(self, frame: VisualizationFrame, block: SignalBlock) -> None:
        del block
        from sonic_eeg_prototype.sound_engine.sonify import synthesize_audio_mix

        sums: Dict[str, Dict[str, float]] = {
            name: {band: 0.0 for band in self.config.bands} for name in ("TL", "TR", "BL", "BR")
        }
        counts = {name: 0 for name in sums}
        for channel in frame.channels:
            for target in _quadrant(channel):
                counts[target] += 1
                for band in sums[target]:
                    sums[target][band] += float(channel.band_powers.get(band, 0.0))

        per_quad = {}
        for name, values in sums.items():
            count = max(1, counts[name])
            per_quad[name] = {"band_powers": {band: value / count for band, value in values.items()}}

        stereo = synthesize_audio_mix(per_quad, self.config)
        pcm = (np.clip(stereo, -1.0, 1.0) * 32767.0).astype(np.int16)
        path = self.output_dir / f"frame_{frame.frame_id:06d}.wav"
        with wave.open(str(path), "wb") as handle:
            handle.setnchannels(2)
            handle.setsampwidth(2)
            handle.setframerate(self.config.sample_rate)
            handle.writeframes(pcm.tobytes())

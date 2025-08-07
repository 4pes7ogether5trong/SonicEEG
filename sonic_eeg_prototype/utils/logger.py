import json
import wave
from datetime import datetime
from pathlib import Path
from typing import Dict

import numpy as np
from PIL import Image


class RunLogger:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.output_dir = base_dir / "output"
        self.logs_dir = self.output_dir / "logs"
        self.screens_dir = self.output_dir / "debug_screenshots"
        self.audio_dir = self.output_dir / "audio"

    def start_new_run(self) -> str:
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        (self.logs_dir / ts).mkdir(parents=True, exist_ok=True)
        (self.screens_dir / ts).mkdir(parents=True, exist_ok=True)
        (self.audio_dir / ts).mkdir(parents=True, exist_ok=True)
        return ts

    def save_quadrant_image(self, pil_image: Image.Image, run_ts: str, step_idx: int, quad_name: str):
        path = self.screens_dir / run_ts / f"step{step_idx:03d}_{quad_name}.png"
        pil_image.save(path)

    def save_audio(self, stereo_pcm: np.ndarray, run_ts: str, step_idx: int, sample_rate: int = 44100):
        path = self.audio_dir / run_ts / f"step{step_idx:03d}.wav"
        # Ensure int16 stereo
        pcm = np.clip(stereo_pcm, -1.0, 1.0)
        int16 = (pcm * 32767.0).astype(np.int16)
        with wave.open(str(path), 'wb') as wf:
            wf.setnchannels(2)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(int16.tobytes())

    def log_step(self, run_ts: str, step_idx: int, per_quad_results: Dict):
        path = self.logs_dir / run_ts / f"step{step_idx:03d}.json"
        with open(path, 'w') as f:
            json.dump(per_quad_results, f, indent=2)
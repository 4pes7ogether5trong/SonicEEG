from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Tuple, List


@dataclass
class AppConfig:
    base_dir: Path

    def __post_init__(self):
        self.output_dir = self.base_dir / "output"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        (self.output_dir / "audio").mkdir(parents=True, exist_ok=True)
        (self.output_dir / "debug_screenshots").mkdir(parents=True, exist_ok=True)
        (self.output_dir / "logs").mkdir(parents=True, exist_ok=True)

        self.sample_rate: int = 44100
        self.frame_seconds: float = 1.0

        # Default bands in Hz
        self.bands: Dict[str, Tuple[float, float]] = {
            "delta": (0.5, 4.0),
            "theta": (4.0, 8.0),
            "alpha": (8.0, 12.0),
            "beta": (13.0, 30.0),
            "gamma": (30.0, 100.0),
        }

        # Musical mapping centers (approx C notes in Hz per octave)
        self.band_base_freq: Dict[str, float] = {
            "delta": 65.41,   # C2
            "theta": 130.81,  # C3
            "alpha": 261.63,  # C4
            "beta": 523.25,   # C5
            "gamma": 1046.50, # C6
        }

        # Harmonic recipe per band (multipliers)
        self.band_harmonics: Dict[str, List[float]] = {
            "delta": [1.0, 1.5],                 # 1st + 5th
            "theta": [1.0, 1.25, 1.667],         # 1st + 3rd + ~6th
            "alpha": [1.0, 1.25, 1.5, 1.75],     # 1st + 3rd + 5th + 7th
            "beta": [1.0, 1.125, 1.333, 1.667],  # 1st + 2nd + 4th + 6th
            "gamma": [i for i in [1,2,3,4,5,6,7,8] if i <= 8],
        }

        # Stereo panning per quadrant (L, R gains)
        self.panning: Dict[str, Tuple[float, float]] = {
            "TL": (1.0, 0.0),
            "TR": (0.0, 1.0),
            "BL": (0.7, 0.3),
            "BR": (0.3, 0.7),
        }

        # Quadrant margins as fractions of full image dims (left, top, right, bottom)
        self.quad_margins: Dict[str, Tuple[float, float, float, float]] = {
            "TL": (0.0, 0.0, 0.5, 0.5),
            "TR": (0.5, 0.0, 1.0, 0.5),
            "BL": (0.0, 0.5, 0.5, 1.0),
            "BR": (0.5, 0.5, 1.0, 1.0),
        }

        # Thresholds
        self.edge_threshold: int = 40
        self.trace_lowpass_smooth: int = 5

        # Demo settings
        self.demo_width: int = 1280
        self.demo_height: int = 720

        # Optional fallback image for capture errors
        self.fallback_image_path: Path = self.base_dir / "sample_inputs" / "demo_screen.png"
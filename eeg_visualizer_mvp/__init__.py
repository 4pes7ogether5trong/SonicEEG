"""Source-agnostic EEG visualization pipeline for SonicEEG."""

from .features import FeatureEngine
from .model import SignalBlock, VisualizationFrame

__all__ = ["FeatureEngine", "SignalBlock", "VisualizationFrame"]
__version__ = "0.1.0"

from pathlib import Path
from typing import Optional

from PIL import Image

try:
    import mss  # type: ignore
except Exception:  # pragma: no cover
    mss = None

try:
    import pyautogui  # type: ignore
except Exception:  # pragma: no cover
    pyautogui = None

try:
    from PIL import ImageGrab  # type: ignore
except Exception:  # pragma: no cover
    ImageGrab = None

try:  # Package import used by the modular visualizer.
    from sonic_eeg_prototype.utils.config import AppConfig
except ModuleNotFoundError:  # Preserve direct legacy script execution.
    from utils.config import AppConfig


def capture_fullscreen(config: AppConfig) -> Image.Image:
    # Try mss first
    if mss is not None:
        try:
            with mss.mss() as sct:
                monitor = sct.monitors[1]
                img = sct.grab(monitor)
                return Image.frombytes('RGB', img.size, img.bgra, 'raw', 'BGRX')
        except Exception:
            pass

    # Try pyautogui
    if pyautogui is not None:
        try:
            return pyautogui.screenshot()
        except Exception:
            pass

    # Try PIL ImageGrab
    if ImageGrab is not None:
        try:
            return ImageGrab.grab()
        except Exception:
            pass

    # Fallback to demo image if exists
    if Path(config.fallback_image_path).exists():
        return Image.open(config.fallback_image_path).convert('RGB')

    if not getattr(config, "allow_blank_fallback", True):
        raise RuntimeError("screen capture failed; no capture backend is available")

    # Legacy direct use preserves its former blank-image fallback.
    return Image.new('RGB', (config.demo_width, config.demo_height), color=(32, 32, 32))

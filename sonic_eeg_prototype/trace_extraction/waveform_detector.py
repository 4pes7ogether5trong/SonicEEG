from typing import Optional

import numpy as np
from PIL import Image, ImageFilter

try:
    import cv2  # type: ignore
except Exception:  # pragma: no cover
    cv2 = None

from utils.config import AppConfig


def _edge_detect_np(gray: np.ndarray, threshold: int) -> np.ndarray:
    # Simple gradient magnitude threshold
    gy, gx = np.gradient(gray.astype(np.float32))
    mag = np.sqrt(gx * gx + gy * gy)
    mag = (mag / (mag.max() + 1e-6)) * 255.0
    edges = (mag > float(threshold)).astype(np.uint8) * 255
    return edges


def extract_waveform_trace(image: Image.Image, config: AppConfig) -> np.ndarray:
    # Convert to grayscale
    gray_img = image.convert('L').filter(ImageFilter.MedianFilter(size=3))
    gray = np.asarray(gray_img)

    # Edge detection
    if cv2 is not None:
        try:
            edges = cv2.Canny(gray, config.edge_threshold, config.edge_threshold * 2)
        except Exception:
            edges = _edge_detect_np(gray, config.edge_threshold)
    else:
        edges = _edge_detect_np(gray, config.edge_threshold)

    h, w = edges.shape

    # For each column, select the row index of the strongest edge near the midline
    mid = h // 2
    window = max(5, h // 3)
    top = max(0, mid - window)
    bottom = min(h, mid + window)

    trace_indices = np.zeros(w, dtype=np.int32)

    for x in range(w):
        column = edges[top:bottom, x]
        # Prefer lower rows if multiple edges (EEGs often trace center)
        ys = np.where(column > 0)[0]
        if ys.size == 0:
            trace_indices[x] = mid
        else:
            # Choose the median edge row to be robust
            trace_indices[x] = top + int(np.median(ys))

    # Smooth the trace
    if config.trace_lowpass_smooth > 1:
        k = config.trace_lowpass_smooth
        kernel = np.ones(k) / k
        trace_smooth = np.convolve(trace_indices.astype(np.float32), kernel, mode='same')
    else:
        trace_smooth = trace_indices.astype(np.float32)

    return trace_smooth
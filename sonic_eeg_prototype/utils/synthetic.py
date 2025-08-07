from typing import Tuple

import numpy as np
from PIL import Image, ImageDraw

from utils.config import AppConfig


def _draw_trace(draw: ImageDraw.ImageDraw, bbox: Tuple[int, int, int, int], freq: float, phase: float, noise: float):
    left, top, right, bottom = bbox
    width = right - left
    height = bottom - top
    mid_y = top + height // 2
    amp = height * 0.3

    points = []
    for x in range(left, right):
        t = (x - left) / max(1, width)
        y = mid_y + int(amp * np.sin(2 * np.pi * (freq * t + phase)))
        y += int(np.random.randn() * noise)
        points.append((x, y))

    draw.line(points, fill=(0, 255, 0), width=2)


def generate_synthetic_screenshot(config: AppConfig) -> Image.Image:
    w = config.demo_width
    h = config.demo_height
    img = Image.new('RGB', (w, h), color=(10, 10, 10))
    draw = ImageDraw.Draw(img)

    # Grid
    grid_color = (40, 40, 40)
    for x in range(0, w, 40):
        draw.line([(x, 0), (x, h)], fill=grid_color)
    for y in range(0, h, 40):
        draw.line([(0, y), (w, y)], fill=grid_color)

    # Quadrant boxes
    quads = {
        "TL": (0, 0, w // 2, h // 2),
        "TR": (w // 2, 0, w, h // 2),
        "BL": (0, h // 2, w // 2, h),
        "BR": (w // 2, h // 2, w, h),
    }

    for i, (name, bbox) in enumerate(quads.items()):
        draw.rectangle(bbox, outline=(80, 80, 80), width=2)
        base_freq = 3 + i  # vary
        phase = np.random.rand()
        noise = 2 + i
        _draw_trace(draw, bbox, base_freq, phase, noise)

    return img
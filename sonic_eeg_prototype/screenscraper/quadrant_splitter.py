from typing import Dict
from PIL import Image

from utils.config import AppConfig


def split_quadrants(image: Image.Image, config: AppConfig) -> Dict[str, Image.Image]:
    width, height = image.size
    result = {}
    for name, (l_frac, t_frac, r_frac, b_frac) in config.quad_margins.items():
        left = int(l_frac * width)
        top = int(t_frac * height)
        right = int(r_frac * width)
        bottom = int(b_frac * height)
        crop = image.crop((left, top, right, bottom))
        result[name] = crop
    return result
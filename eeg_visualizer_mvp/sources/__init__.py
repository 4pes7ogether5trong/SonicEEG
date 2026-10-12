"""Lazy source exports keep screen and EDF dependencies genuinely optional."""

from importlib import import_module

__all__ = [
    "RawFileSource",
    "ScreenSource",
    "SyntheticSource",
    "load_raw_file",
    "make_synthetic_recording",
]

_EXPORTS = {
    "RawFileSource": ("raw_file", "RawFileSource"),
    "load_raw_file": ("raw_file", "load_raw_file"),
    "ScreenSource": ("screen", "ScreenSource"),
    "SyntheticSource": ("synthetic", "SyntheticSource"),
    "make_synthetic_recording": ("synthetic", "make_synthetic_recording"),
}


def __getattr__(name: str):
    if name not in _EXPORTS:
        raise AttributeError(name)
    module_name, attribute = _EXPORTS[name]
    return getattr(import_module(f"{__name__}.{module_name}"), attribute)

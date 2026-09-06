from __future__ import annotations

from typing import Iterator, Protocol

from ..model import SignalBlock


class SignalSource(Protocol):
    def __iter__(self) -> Iterator[SignalBlock]:
        ...

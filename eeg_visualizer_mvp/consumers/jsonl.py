from __future__ import annotations

import json
from pathlib import Path

from ..model import SignalBlock, VisualizationFrame


class JsonlRecorder:
    """Explicit opt-in feature recording; raw samples are never written."""

    def __init__(self, output_path: Path | str) -> None:
        self.output_path = Path(output_path)
        self.output_path.parent.mkdir(parents=True, exist_ok=True)

    def consume(self, frame: VisualizationFrame, block: SignalBlock) -> None:
        del block
        with self.output_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(frame.to_dict(), separators=(",", ":")) + "\n")

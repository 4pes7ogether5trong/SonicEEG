from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Callable, Iterable, List, Optional, Protocol

from .features import FeatureEngine
from .model import SignalBlock, VisualizationFrame


class FrameConsumer(Protocol):
    def consume(self, frame: VisualizationFrame, block: SignalBlock) -> None:
        ...


@dataclass
class PipelineResult:
    frames_processed: int = 0
    stopped_by_request: bool = False


class VisualizerPipeline:
    """One feature path, many independent sources and optional consumers."""

    def __init__(
        self,
        source: Iterable[SignalBlock],
        *,
        age_provider: Callable[[], float],
        on_frame: Callable[[VisualizationFrame], None],
        consumers: Optional[List[FrameConsumer]] = None,
        feature_engine: Optional[FeatureEngine] = None,
    ) -> None:
        self.source = source
        self.age_provider = age_provider
        self.on_frame = on_frame
        self.consumers = list(consumers or [])
        self.feature_engine = feature_engine or FeatureEngine()
        self.stop_event = threading.Event()

    def stop(self) -> None:
        self.stop_event.set()

    def process_block(self, block: SignalBlock) -> VisualizationFrame:
        frame = self.feature_engine.analyze(block, self.age_provider())
        self.on_frame(frame)
        for consumer in self.consumers:
            consumer.consume(frame, block)
        return frame

    def run(self, frame_limit: Optional[int] = None) -> PipelineResult:
        result = PipelineResult()
        for block in self.source:
            if self.stop_event.is_set():
                result.stopped_by_request = True
                break
            self.process_block(block)
            result.frames_processed += 1
            if frame_limit is not None and result.frames_processed >= frame_limit:
                break
        return result

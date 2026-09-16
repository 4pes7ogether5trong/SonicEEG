from __future__ import annotations

import argparse
import json
import threading
from pathlib import Path
from typing import List, Optional

from .consumers import JsonlRecorder, LegacySonificationConsumer
from .pipeline import FrameConsumer, VisualizerPipeline
from .server import RuntimeState, make_server
from .sources.raw_file import RawFileSource
from .sources.synthetic import SyntheticSource


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="SonicEEG modular visualization MVP")
    parser.add_argument("--source", choices=("synthetic", "raw", "screen"), default="synthetic")
    parser.add_argument("--age", type=float, default=30.0, help="Patient age in years (reference layer only)")
    parser.add_argument("--window-seconds", type=float, default=4.0)
    parser.add_argument("--hop-seconds", type=float, default=0.25)
    parser.add_argument("--no-realtime", action="store_true", help="Process as quickly as possible")
    parser.add_argument("--loop", action="store_true", help="Loop a finite raw recording")

    raw = parser.add_argument_group("raw-file source")
    raw.add_argument("--input", type=Path, help="Deidentified CSV/TSV/NPY/NPZ/EDF/BDF")
    raw.add_argument("--sample-rate", type=float, help="Hz; inferred from CSV time or NPZ when available")
    raw.add_argument("--unit", default="uV", help="uV, mV, V, relative, or unknown")
    raw.add_argument("--channels", help="Comma-separated channel names for NPY input")

    screen = parser.add_argument_group("screen source")
    screen.add_argument("--screen-seconds", type=float, help="Seconds represented across each ROI (required)")
    screen.add_argument("--screen-rois", type=Path, help="JSON mapping labels to fractional ROI rectangles")
    screen.add_argument("--uv-per-pixel", type=float, help="Optional voltage calibration; omit for relative display")
    screen.add_argument("--screen-interval", type=float, default=0.5)

    output = parser.add_argument_group("optional outputs")
    output.add_argument("--record-jsonl", type=Path, help="Record derived frames; raw samples are not persisted")
    output.add_argument("--sonify-dir", type=Path, help="Enable legacy WAV output as an independent consumer")
    output.add_argument("--export-frame", type=Path, help="Process one frame to JSON and exit without a server")

    server = parser.add_argument_group("local viewer")
    server.add_argument("--host", default="127.0.0.1")
    server.add_argument("--port", type=int, default=8765)
    return parser


def build_source(args: argparse.Namespace):
    realtime = not args.no_realtime
    if args.source == "synthetic":
        return SyntheticSource(
            age_years=args.age,
            window_seconds=args.window_seconds,
            hop_seconds=args.hop_seconds,
            realtime=realtime,
            loop=True,
        )
    if args.source == "raw":
        if args.input is None:
            raise ValueError("--input is required for --source raw")
        channels = tuple(part.strip() for part in args.channels.split(",")) if args.channels else None
        return RawFileSource(
            args.input,
            sample_rate_hz=args.sample_rate,
            unit=args.unit,
            channel_names=channels,
            window_seconds=args.window_seconds,
            hop_seconds=args.hop_seconds,
            realtime=realtime,
            loop=args.loop,
        )
    if args.screen_seconds is None:
        raise ValueError("--screen-seconds is required for --source screen; guessing would corrupt frequency")
    from .sources.screen import ScreenSource

    return ScreenSource(
        seconds_visible=args.screen_seconds,
        roi_config=args.screen_rois,
        uv_per_pixel=args.uv_per_pixel,
        interval_seconds=args.screen_interval,
        realtime=realtime,
    )


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    if not 1.0 <= args.age <= 100.0:
        raise SystemExit("--age must be between 1 and 100 years")
    try:
        source = build_source(args)
    except (ValueError, RuntimeError, FileNotFoundError) as error:
        raise SystemExit(str(error)) from error

    state = RuntimeState(args.age)
    consumers: List[FrameConsumer] = []
    if args.record_jsonl:
        consumers.append(JsonlRecorder(args.record_jsonl))
    if args.sonify_dir:
        consumers.append(LegacySonificationConsumer(args.sonify_dir))

    pipeline = VisualizerPipeline(
        source,
        age_provider=state.age,
        on_frame=state.publish,
        consumers=consumers,
    )

    if args.export_frame:
        result = pipeline.run(frame_limit=1)
        snapshot = state.snapshot()
        if result.frames_processed != 1 or snapshot["frame"] is None:
            raise SystemExit("source produced no frame")
        args.export_frame.parent.mkdir(parents=True, exist_ok=True)
        args.export_frame.write_text(json.dumps(snapshot["frame"], indent=2), encoding="utf-8")
        print(f"Exported frame: {args.export_frame}")
        return 0

    def worker() -> None:
        try:
            pipeline.run()
            state.complete()
        except BaseException as error:  # Surface worker failures in the local UI.
            state.fail(error)

    thread = threading.Thread(target=worker, name="soniceeg-pipeline", daemon=True)
    thread.start()
    server = make_server(state, args.host, args.port)
    print(f"SonicEEG visualizer: http://{args.host}:{server.server_port}")
    print("Visualization is research-only. Raw samples and screen images are not stored by default.")
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        pipeline.stop()
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

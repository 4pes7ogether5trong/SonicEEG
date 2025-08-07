import argparse
import time
from pathlib import Path

from utils.config import AppConfig
from utils.logger import RunLogger
from screenscraper.quadrant_splitter import split_quadrants
from trace_extraction.waveform_detector import extract_waveform_trace
from trace_extraction.signal_converter import trace_to_signal
from sound_engine.frequency_analyzer import compute_band_powers
from sound_engine.sonify import synthesize_audio_mix
from utils.synthetic import generate_synthetic_screenshot


def process_frame(image, config: AppConfig, run_logger: RunLogger, run_ts: str, step_idx: int):
    quadrants = split_quadrants(image, config)

    per_quad_results = {}

    for quad_name, quad_img in quadrants.items():
        run_logger.save_quadrant_image(quad_img, run_ts, step_idx, quad_name)

        trace = extract_waveform_trace(quad_img, config)
        signal = trace_to_signal(trace, config)
        band_powers = compute_band_powers(signal, config)
        per_quad_results[quad_name] = {
            "band_powers": band_powers,
            "trace_len": len(trace),
            "signal_len": len(signal),
        }

    stereo_mix = synthesize_audio_mix(per_quad_results, config)
    run_logger.save_audio(stereo_mix, run_ts, step_idx)
    run_logger.log_step(run_ts, step_idx, per_quad_results)


def main():
    parser = argparse.ArgumentParser(description="Sonic EEG Prototype")
    parser.add_argument("--demo", action="store_true", help="Use synthetic demo frame instead of screen capture")
    parser.add_argument("--once", action="store_true", help="Run a single step and exit")
    parser.add_argument("--steps", type=int, default=5, help="Number of steps to run if not --once")
    parser.add_argument("--interval", type=float, default=1.0, help="Seconds between steps")
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parent
    config = AppConfig(base_dir)
    run_logger = RunLogger(base_dir)

    run_ts = run_logger.start_new_run()
    print(f"Run started: {run_ts}")

    if args.once:
        step_count = 1
    else:
        step_count = max(1, args.steps)

    for step_idx in range(step_count):
        try:
            if args.demo:
                image = generate_synthetic_screenshot(config)
            else:
                # Import here to avoid optional dependency issues during demo
                from screenscraper.capture import capture_fullscreen
                image = capture_fullscreen(config)

            process_frame(image, config, run_logger, run_ts, step_idx)
            print(f"Completed step {step_idx}")
        except Exception as e:
            import traceback
            print("Error during processing:\n", traceback.format_exc())
            raise

        if not args.once and step_idx < step_count - 1:
            time.sleep(max(0.0, args.interval))


if __name__ == "__main__":
    main()
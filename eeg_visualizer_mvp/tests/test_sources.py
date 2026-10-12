import tempfile
import unittest
from pathlib import Path

import numpy as np

try:
    from PIL import Image, ImageDraw
except ImportError:  # Core synthetic/raw installs do not require screen dependencies.
    Image = None
    ImageDraw = None

from eeg_visualizer_mvp.features import FeatureEngine
from eeg_visualizer_mvp.sources.raw_file import RawFileSource, load_raw_file
from eeg_visualizer_mvp.sources.synthetic import SyntheticSource, make_synthetic_recording


class SourceTests(unittest.TestCase):
    def test_simulation_001_is_deterministic_and_has_19_channels(self):
        first, names_first = make_synthetic_recording(duration_seconds=4.0, seed=77)
        second, names_second = make_synthetic_recording(duration_seconds=4.0, seed=77)
        self.assertEqual(names_first, names_second)
        self.assertEqual(len(names_first), 19)
        np.testing.assert_array_equal(first, second)

        block = next(iter(SyntheticSource(realtime=False, loop=False)))
        frame = FeatureEngine().analyze(block, 30)
        occipital = next(channel for channel in frame.channels if channel.name == "O1")
        self.assertEqual(occipital.dominant_band, "alpha")
        self.assertAlmostEqual(occipital.dominant_frequency_hz, 10.0, delta=0.3)

    def test_csv_time_inference_and_voltage_unit_conversion(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "deidentified.csv"
            times = np.arange(512) / 128.0
            with path.open("w", encoding="utf-8") as handle:
                handle.write("time,O1,O2\n")
                for value in times:
                    handle.write(f"{value:.8f},{0.02*np.sin(2*np.pi*10*value):.8f},{0.01*np.sin(2*np.pi*8*value):.8f}\n")
            data, rate, names, unit, calibrated = load_raw_file(path, unit="mV")
            self.assertAlmostEqual(rate, 128.0, places=3)
            self.assertEqual(names, ("O1", "O2"))
            self.assertEqual(unit, "uV")
            self.assertTrue(calibrated)
            self.assertAlmostEqual(float(np.max(data[0])), 20.0, delta=0.05)

            source = RawFileSource(path, unit="mV", window_seconds=2.0, realtime=False)
            block = next(iter(source))
            self.assertNotIn(path.name, str(block.metadata))
            self.assertEqual(block.data.shape, (2, 256))

    @unittest.skipIf(Image is None, "screen extras are not installed")
    def test_screen_source_has_explicit_pixel_timebase_and_relative_voltage(self):
        from eeg_visualizer_mvp.sources.screen import ScreenSource

        image = Image.new("RGB", (800, 400), "white")
        draw = ImageDraw.Draw(image)
        for row in range(2):
            for col in range(2):
                left, top = col * 400, row * 200
                points = []
                for x in range(400):
                    y = top + 100 + 40 * np.sin(2 * np.pi * 10 * x / 400)
                    points.append((left + x, int(y)))
                draw.line(points, fill="black", width=2)

        source = ScreenSource(
            seconds_visible=4.0,
            capture_fn=lambda: image,
            realtime=False,
            trace_lowpass_smooth=3,
        )
        block = next(iter(source))
        self.assertEqual(block.data.shape[0], 4)
        self.assertAlmostEqual(block.sample_rate_hz, 100.0)
        self.assertFalse(block.voltage_calibrated)
        frame = FeatureEngine().analyze(block, 30)
        self.assertTrue(any("uncalibrated" in warning.lower() for warning in frame.warnings))
        self.assertAlmostEqual(frame.channels[0].dominant_frequency_hz, 2.5, delta=0.6)


if __name__ == "__main__":
    unittest.main()

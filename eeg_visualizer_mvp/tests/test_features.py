import unittest

import numpy as np

from eeg_visualizer_mvp.features import ENCODING, FeatureEngine
from eeg_visualizer_mvp.model import SignalBlock
from eeg_visualizer_mvp.sources.synthetic import make_synthetic_recording


class FeatureEngineTests(unittest.TestCase):
    def test_recovers_frequency_and_voltage_from_known_sine(self):
        sample_rate = 256.0
        t = np.arange(int(sample_rate * 4.0)) / sample_rate
        data = (25.0 * np.sin(2 * np.pi * 10.0 * t + 0.3))[None, :]
        block = SignalBlock(data, sample_rate, ("O1",), "test", 0.0)
        channel = FeatureEngine().analyze(block, 30).channels[0]
        self.assertAlmostEqual(channel.dominant_frequency_hz, 10.0, delta=0.26)
        self.assertEqual(channel.dominant_band, "alpha")
        self.assertAlmostEqual(channel.rms_amplitude, 25.0 / np.sqrt(2), delta=0.1)
        self.assertGreater(channel.band_powers["alpha"], 0.98)

    def test_age_changes_reference_not_measurement(self):
        data, names = make_synthetic_recording(duration_seconds=5.0)
        block = SignalBlock(data[:, :1024], 256.0, names, "test", 0.0)
        young = FeatureEngine().analyze(block, 5)
        adult = FeatureEngine().analyze(block, 30)
        self.assertNotEqual(
            young.age_reference["posterior_rhythm_reference_hz"],
            adult.age_reference["posterior_rhythm_reference_hz"],
        )
        for first, second in zip(young.channels, adult.channels):
            self.assertEqual(first.dominant_frequency_hz, second.dominant_frequency_hz)
            self.assertEqual(first.signed_voltage, second.signed_voltage)
            self.assertEqual(first.band_powers, second.band_powers)

    def test_visual_encodings_have_one_declared_signal_meaning(self):
        self.assertEqual(len(ENCODING), len(set(ENCODING)))
        self.assertNotIn("emotion", " ".join(ENCODING.values()).lower())
        self.assertNotIn("pain", " ".join(ENCODING.values()).lower())

    def test_flatline_is_integrity_candidate_not_abnormality(self):
        block = SignalBlock(np.zeros((1, 256)), 128.0, ("Cz",), "test", 0.0)
        frame = FeatureEngine().analyze(block, 30)
        self.assertIn("flatline_candidate", frame.channels[0].quality_flags)
        self.assertTrue(frame.candidates["signal_integrity"])
        self.assertEqual(frame.candidates["abnormality"], [])


if __name__ == "__main__":
    unittest.main()

import json
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path

from eeg_visualizer_mvp.consumers.sonification import LegacySonificationConsumer
from eeg_visualizer_mvp.pipeline import VisualizerPipeline
from eeg_visualizer_mvp.server import RuntimeState, make_server
from eeg_visualizer_mvp.sources.synthetic import SyntheticSource


class CapturingConsumer:
    def __init__(self):
        self.frame_ids = []

    def consume(self, frame, block):
        self.frame_ids.append((frame.frame_id, block.source_kind))


class PipelineAndServerTests(unittest.TestCase):
    def test_exported_frame_contains_schema_required_fields(self):
        schema_path = Path(__file__).resolve().parents[1] / "frame.schema.json"
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        state = RuntimeState(30)
        pipeline = VisualizerPipeline(
            SyntheticSource(realtime=False, loop=False),
            age_provider=state.age,
            on_frame=state.publish,
        )
        pipeline.run(frame_limit=1)
        frame = state.snapshot()["frame"]
        self.assertTrue(set(schema["required"]).issubset(frame))
        self.assertEqual(frame["schema"], schema["properties"]["schema"]["const"])

    def test_optional_consumers_do_not_affect_visual_frame(self):
        state = RuntimeState(30)
        capture = CapturingConsumer()
        pipeline = VisualizerPipeline(
            SyntheticSource(realtime=False, loop=False),
            age_provider=state.age,
            on_frame=state.publish,
            consumers=[capture],
        )
        result = pipeline.run(frame_limit=1)
        self.assertEqual(result.frames_processed, 1)
        self.assertEqual(capture.frame_ids, [(1, "synthetic")])
        self.assertEqual(state.snapshot()["frame"]["schema"], "soniceeg.visual-frame/1")

    def test_legacy_sonification_is_opt_in_adapter(self):
        state = RuntimeState(30)
        source = SyntheticSource(realtime=False, loop=False)
        with tempfile.TemporaryDirectory() as directory:
            pipeline = VisualizerPipeline(
                source,
                age_provider=state.age,
                on_frame=state.publish,
                consumers=[LegacySonificationConsumer(directory)],
            )
            pipeline.run(frame_limit=1)
            self.assertTrue((Path(directory) / "frame_000001.wav").is_file())

    def test_local_api_serves_frame_and_updates_reference_age(self):
        state = RuntimeState(30)
        block = next(iter(SyntheticSource(realtime=False, loop=False)))
        pipeline = VisualizerPipeline([block], age_provider=state.age, on_frame=state.publish)
        pipeline.run(frame_limit=1)
        server = make_server(state, "127.0.0.1", 0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f"http://127.0.0.1:{server.server_port}"
            with urllib.request.urlopen(base + "/api/frame", timeout=3) as response:
                payload = json.load(response)
                self.assertEqual(payload["frame"]["source_kind"], "synthetic")
                self.assertEqual(response.headers["Cache-Control"], "no-store")
            with urllib.request.urlopen(base + "/", timeout=3) as response:
                self.assertIn("Signal Constellation", response.read().decode("utf-8"))
            request = urllib.request.Request(
                base + "/api/age",
                data=json.dumps({"age_years": 12}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=3) as response:
                self.assertEqual(json.load(response)["age_years"], 12.0)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()

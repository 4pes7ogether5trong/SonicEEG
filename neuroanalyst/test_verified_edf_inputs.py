import csv
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
from pathlib import Path
import tempfile
import threading
import time
import unittest

from verified_edf_inputs import Source, complete, local_files, manifest, stage


class Response(io.BytesIO):
    def __init__(self, body, status=200, headers=None):
        super().__init__(body)
        self.status = status
        self.headers = headers or {}


class StageTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.cache = self.root / "cache"
        self.raw = b"published native fixture bytes"
        self.digest = hashlib.sha256(self.raw).hexdigest()
        self.src = Source(self.digest, len(self.raw), "https://example.org/test.edf", "id/file.edf")
        self.final = self.cache / (self.digest + ".edf")
        self.partial = self.cache / (self.digest + ".part")

    def stage(self, opener, **options):
        return stage(self.src, self.cache, opener=opener, attempts=1, sleep=lambda _: None, **options)

    def test_full_file_and_cache_reverification(self):
        self.assertEqual(self.stage(lambda *_a, **_k: Response(self.raw)), "verified-download")
        self.assertEqual(self.stage(lambda *_a, **_k: self.fail("already verified")), "cached")
        self.final.write_bytes(b"!" * len(self.raw))
        self.assertEqual(self.stage(lambda *_a, **_k: Response(self.raw)), "verified-download")
        self.assertTrue(complete(self.final, self.src))

    def test_resume_after_interrupted_run(self):
        prefix = self.raw[:7]
        with self.assertRaisesRegex(OSError, "incomplete"):
            self.stage(lambda *_a, **_k: Response(prefix))
        self.assertFalse(self.final.exists())
        self.assertEqual(self.partial.read_bytes(), prefix)

        def remaining(req, timeout):
            self.assertEqual(req.get_header("Range"), "bytes=7-")
            return Response(self.raw[7:], 206, {"Content-Range": f"bytes 7-{len(self.raw)-1}/{len(self.raw)}"})

        self.assertEqual(self.stage(remaining), "verified-download")
        self.assertEqual(self.final.read_bytes(), self.raw)

    def test_mirror_can_ignore_range(self):
        self.cache.mkdir()
        self.partial.write_bytes(self.raw[:8])
        self.assertEqual(self.stage(lambda *_a, **_k: Response(self.raw)), "verified-download")
        self.assertTrue(complete(self.final, self.src))

    def test_server_can_return_short_but_valid_ranges(self):
        def pieces(req, timeout):
            start = int((req.get_header("Range") or "bytes=0-")[6:-1])
            end = min(start + 6, len(self.raw))
            return Response(self.raw[start:end], 206, {"Content-Range": f"bytes {start}-{end-1}/{len(self.raw)}"})
        self.assertEqual(self.stage(pieces), "verified-download")

    def test_bad_range_leaves_existing_prefix(self):
        self.cache.mkdir()
        self.partial.write_bytes(self.raw[:4])
        with self.assertRaisesRegex(OSError, "requested native"):
            self.stage(lambda *_a, **_k: Response(b"bad", 206, {"Content-Range": f"bytes 0-2/{len(self.raw)}"}))
        self.assertEqual(self.partial.read_bytes(), self.raw[:4])
        self.assertFalse(self.final.exists())

    def test_untrusted_response_never_reaches_final_name(self):
        for body, headers in ((b"?" * len(self.raw), {}), (self.raw + b"!", {}),
                              (self.raw, {"Content-Encoding": "gzip"}),
                              (self.raw, {"Content-Length": "0"})):
            with self.subTest(headers=headers, length=len(body)):
                with self.assertRaises(OSError):
                    self.stage(lambda *_a, **_k: Response(body, headers=headers))
                self.assertFalse(self.final.exists())

    def test_alternative_publisher_endpoint_after_bad_bytes(self):
        src = Source(self.digest, len(self.raw), "https://s3.amazonaws.com/physionet-open/example.edf")
        visits = []
        def mirror(req, timeout):
            visits.append(req.full_url)
            return Response(b"!" * len(self.raw) if len(visits) == 1 else self.raw)
        self.assertEqual(stage(src, self.cache, opener=mirror, attempts=1), "verified-download")
        self.assertEqual(len(visits), 2)
        self.assertTrue(complete(self.final, self.src))

    def test_native_copy_and_no_path_escape(self):
        src_path = self.root / "input/id/file.edf"
        src_path.parent.mkdir(parents=True)
        src_path.write_bytes(self.raw)
        self.assertEqual(self.stage(lambda *_a, **_k: self.fail("already available"), local=self.root / "input"),
                         "verified-local")
        unsafe = Source(self.digest, len(self.raw), self.src.url, "../outside")
        self.assertEqual(list(local_files(self.root / "input", unsafe)), [self.root / "input" / (self.digest + ".edf")])

    def test_competing_readers_publish_one_verified_file(self):
        calls = []
        lock = threading.Lock()
        def counted(_req, timeout):
            with lock:
                calls.append(1)
            time.sleep(0.05)
            return Response(self.raw)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.stage(counted), range(2)))
        self.assertCountEqual(results, ["cached", "verified-download"])
        self.assertEqual(len(calls), 1)

    def test_release_manifest_and_conflicts(self):
        path = self.root / "sources.tsv"
        head = ["recording", "publisher_edf_sha256", "publisher_edf_bytes", "publisher_edf_url"]
        row = [self.src.recording, self.digest, self.src.size, self.src.url]
        with path.open("w", newline="") as handle:
            w = csv.writer(handle, delimiter="\t")
            w.writerows([head, row, row])
        self.assertEqual(manifest(path), {self.digest: self.src})
        with path.open("a", newline="") as handle:
            csv.writer(handle, delimiter="\t").writerow([row[0], self.digest, self.src.size+1, self.src.url])
        with self.assertRaisesRegex(ValueError, "contradictory"):
            manifest(path)
        with self.assertRaises(ValueError):
            Source("../invalid", 7, self.src.url)


if __name__ == "__main__":
    unittest.main()

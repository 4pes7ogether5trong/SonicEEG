"""Stage original EDF bytes for a research reader. Python 3.9+, standard library.

python verified_edf_inputs.py release.tsv CACHE [--sha HEX] [--local EDF_ROOT]
Rows must have publisher_edf_sha256, publisher_edf_bytes and publisher_edf_url.
Optional 'recording' paths can identify native files already copied from Drive.
Cache/HEX.edf is readable by the model only after the full digest passes.
"""
import argparse
from contextlib import contextmanager
import csv
from dataclasses import dataclass
import hashlib
from http.client import HTTPException
import json
import os
from pathlib import Path
import re
import shutil
import sys
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

BLOCK = 1024 * 1024


@dataclass(frozen=True)
class Source:
    digest: str
    size: int
    url: str
    recording: str = ""

    def __post_init__(self):
        if not re.fullmatch(r"[0-9a-f]{64}", self.digest) or self.size <= 0:
            raise ValueError("invalid native EDF digest or byte count")


def manifest(path):
    fields = {"publisher_edf_sha256", "publisher_edf_bytes", "publisher_edf_url"}
    sources = {}
    with Path(path).open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream, delimiter="\t")
        if not fields.issubset(reader.fieldnames or []):
            raise ValueError("missing native EDF columns")
        for row in reader:
            digest = row["publisher_edf_sha256"].strip().lower()
            url = row["publisher_edf_url"].strip()
            size = int(row["publisher_edf_bytes"])
            parsed = urlsplit(url)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError(f"invalid HTTPS source at row {reader.line_num}")
            src = Source(digest, size, url, (row.get("recording") or "").strip())
            if digest in sources and sources[digest].size != size:
                raise ValueError(f"contradictory sizes at row {reader.line_num}")
            sources.setdefault(digest, src)
    if not sources:
        raise ValueError("manifest contains no EDFs")
    return sources


def locations(url):
    prefixes = (
        "https://s3.amazonaws.com/physionet-open/",
        "https://physionet-open.s3.amazonaws.com/",
        "https://physionet.org/files/",
    )
    yield url
    for prefix in prefixes:
        if url.startswith(prefix):
            suffix = url[len(prefix):]
            yield from (base + suffix for base in prefixes if base != prefix)
            break


def complete(path, src):
    if not path.is_file() or path.stat().st_size != src.size:
        return False
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(BLOCK), b""):
            digest.update(block)
    return digest.hexdigest() == src.digest


@contextmanager
def record_lock(path):
    # OS locks release if the process dies. The marker remains reusable.
    with path.open("a+b") as marker:
        if os.name == "nt":
            import msvcrt
            if marker.seek(0, 2) == 0:
                marker.write(b"0")
                marker.flush()
            marker.seek(0)
            msvcrt.locking(marker.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(marker.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            if os.name == "nt":
                marker.seek(0)
                msvcrt.locking(marker.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(marker.fileno(), fcntl.LOCK_UN)


def local_files(root, src):
    root = Path(root).resolve()
    yield root / (src.digest + ".edf")
    if src.recording:
        target = (root / src.recording).resolve()
        if target != root and root in target.parents:
            yield target


def receive(part, src, url, opener):
    start = part.stat().st_size if part.exists() else 0
    headers = {"Accept-Encoding": "identity", "User-Agent": "Verified-EDF-Inputs/1"}
    if start:
        headers["Range"] = f"bytes={start}-"
    with opener(Request(url, headers=headers), timeout=60) as response:
        if response.headers.get("Content-Encoding", "identity").lower() != "identity":
            raise ValueError("encoded response cannot supply native ranges")
        status = response.status
        if status == 206:
            match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", response.headers.get("Content-Range", ""))
            if not match:
                raise ValueError("missing or malformed Content-Range")
            first, last, total = map(int, match.groups())
            if first != start or not first <= last < src.size or total != src.size:
                raise ValueError("response does not match the requested native byte range")
            expected = last - first + 1
            mode = "ab"
        elif status == 200:
            # Some mirrors ignore Range. Restart from zero only for a full body.
            expected, mode = src.size, "wb"
        else:
            raise ValueError(f"unexpected HTTP {status}")
        declared = response.headers.get("Content-Length")
        if declared is not None and int(declared) != expected:
            raise ValueError("Content-Length disagrees with the expected response length")
        received = 0
        with part.open(mode) as out:
            for block in iter(lambda: response.read(BLOCK), b""):
                if len(block) > expected - received:
                    # Discard this response's prefix rather than appending to an overrun.
                    out.truncate(start if mode == "ab" else 0)
                    raise ValueError("source supplied excess bytes")
                out.write(block)
                received += len(block)
        if received != expected:
            raise OSError(f"incomplete transfer: received {received} of {expected} bytes")


def stage(src, cache, local=None, opener=urlopen, attempts=3, sleep=time.sleep):
    cache = Path(cache)
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / (src.digest + ".edf")
    part = cache / (src.digest + ".part")
    with record_lock(cache / (src.digest + ".lock")):
        if complete(target, src):
            return "cached"
        target.unlink(missing_ok=True)
        if local is not None:
            for candidate in local_files(local, src):
                if candidate.is_file() and candidate.stat().st_size == src.size:
                    # Verify the copied bytes; a source may change during a copy.
                    shutil.copyfile(candidate, part)
                    if complete(part, src):
                        os.replace(part, target)
                        return "verified-local"
                    part.unlink(missing_ok=True)
        last_error = "no source attempt"
        for url in locations(src.url):
            for attempt in range(attempts):
                try:
                    while True:
                        size = part.stat().st_size if part.exists() else 0
                        if size >= src.size:
                            if size == src.size and complete(part, src):
                                os.replace(part, target)
                                return "verified-download"
                            part.unlink()
                            raise ValueError("completed source failed the pinned SHA-256 or byte count")
                        receive(part, src, url, opener)
                except (OSError, ValueError, HTTPException) as error:
                    last_error = str(error)
                    if attempt + 1 < attempts:
                        sleep(min(2 ** attempt, 4))
        raise OSError(f"source unavailable or invalid: {last_error}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("cache", type=Path)
    parser.add_argument("--local", type=Path)
    parser.add_argument("--sha", action="append", dest="selected")
    args = parser.parse_args()
    sources = manifest(args.manifest)
    selected = list(dict.fromkeys(args.selected or sources))
    unknown = set(selected) - sources.keys()
    if unknown:
        parser.error("requested SHA-256 absent from manifest")
    failed = 0
    for digest in selected:
        src = sources[digest]
        result = {"sha256": digest, "bytes": src.size}
        try:
            result["status"] = stage(src, args.cache, args.local)
        except (OSError, ValueError) as err:
            result.update(status="failed", error=str(err))
            failed += 1
        print(json.dumps(result, sort_keys=True), flush=True)
    return int(failed > 0)


if __name__ == "__main__":
    sys.exit(main())

"""Verify source bytes, EDF physical scaling, and annotation; export source excerpt."""
import hashlib, json, pathlib, platform, re, subprocess, sys
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'deps'))
import pyedflib

spec = json.loads((ROOT / 'spec.json').read_text())
(ROOT / 'results').mkdir(exist_ok=True)
edf = ROOT / 'source' / spec['record']
digest = hashlib.sha256(edf.read_bytes()).hexdigest()
assert digest == spec['source_sha256'], (digest, 'SOURCE CHECKSUM FAILED')
summary = (ROOT / 'source/chb01-summary.txt').read_text()
record = summary.split('File Name: chb01_03.edf')[1].split('File Name:')[0]
onset = int(re.search(r'Seizure Start Time: (\d+)', record)[1])
offset = int(re.search(r'Seizure End Time: (\d+)', record)[1])
assert [onset, offset] == spec['annotated_seizure_s']

# Parse only numerical EDF metadata and samples independently of pyedflib.
with edf.open('rb') as f:
    h = f.read(256)
    header_bytes, records, duration, ns = int(h[184:192]), int(h[236:244]), float(h[244:252]), int(h[252:256])
    sizes = [('label',16),('transducer',80),('unit',8),('pmin',8),('pmax',8),('dmin',8),('dmax',8),('prefilter',80),('samples',8),('reserved',32)]
    fields = {name:[f.read(size).decode('ascii').strip() for _ in range(ns)] for name,size in sizes}
counts = np.array(fields['samples'], dtype=int)
assert header_bytes == 256 + 256 * ns
assert edf.stat().st_size == header_bytes + records * int(counts.sum()) * 2
assert np.all(counts / duration == 256)
assert fields['label'][:18] == ['FP1-F7','F7-T7','T7-P7','P7-O1','FP1-F3','F3-C3','C3-P3','P3-O1','FP2-F4','F4-C4','C4-P4','P4-O2','FP2-F8','F8-T8','T8-P8','P8-O2','FZ-CZ','CZ-PZ']
assert all(u == 'uV' for u in fields['unit'][:18]), fields['unit'][:18]
rate = 256
begin = spec['start_s'] - spec['seconds_per_page']
end = spec['end_s'] + spec['seconds_per_page']
first, n = int(begin * rate), int((end - begin) * rate)
raw = np.memmap(edf, dtype='<i2', mode='r', offset=header_bytes, shape=(records, int(counts.sum())))
signals = []
digital_checks, physical_errors = [], []
with pyedflib.EdfReader(str(edf)) as reader:
    assert reader.signals_in_file == ns
    assert reader.file_duration == records * duration
    assert reader.getSignalLabels() == fields['label']
    for i in range(18):
        digital = np.array(raw[:, int(counts[:i].sum()):int(counts[:i+1].sum())]).reshape(-1)[first:first+n]
        assert np.array_equal(digital, reader.readSignal(i, first, n, digital=True))
        pmin,pmax,dmin,dmax = (float(fields[k][i]) for k in ['pmin','pmax','dmin','dmax'])
        physical = (digital.astype(float) - dmin) * ((pmax - pmin) / (dmax - dmin)) + pmin
        via_library = reader.readSignal(i, first, n)
        err = float(np.max(np.abs(physical - via_library)))
        assert err < 1e-8, err
        digital_checks.append(True)
        physical_errors.append(err)
        signals.append(via_library)
np.savez_compressed(ROOT/'source/excerpt.npz', data=np.stack(signals), rate=rate, start_s=begin, names=np.array(fields['label'][:18]))
repo = pathlib.Path(sys.argv[1]).resolve()
revision = subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
# The fixed benchmark is also run on candidate revisions; record rather than force its code identity.
core_files = sorted(repo.glob('browser/*.js'))
manifest = {
    'record':spec['record'], 'sha256':digest, 'bytes':edf.stat().st_size,
    'annotation_seconds':[onset,offset], 'sample_rate_hz':rate,
    'record_duration_s':records*duration, 'total_channels':ns,
    'used_channels':fields['label'][:18], 'unit':'uV',
    'physical_min_uV':fields['pmin'][:18], 'physical_max_uV':fields['pmax'][:18],
    'digital_min':fields['dmin'][:18], 'digital_max':fields['dmax'][:18],
    'edf_prefilter_text':fields['prefilter'][:18],
    'independent_digital_comparison_exact':all(digital_checks),
    'independent_physical_comparison_max_error_uV':max(physical_errors),
    'source_excerpt_s':[begin,end], 'repo_path_tested':str(repo),
    'revision_tested':revision,
    'git_status':subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True),
    'core_sha256':{str(p.relative_to(repo)):hashlib.sha256(p.read_bytes()).hexdigest() for p in core_files},
    'spec_sha256':hashlib.sha256((ROOT/'spec.json').read_bytes()).hexdigest(),
    'versions':{'python':platform.python_version(),'numpy':np.__version__,'pyedflib':pyedflib.__version__, 'node':subprocess.check_output(['node','--version'],text=True).strip()},
    'scope':'Unmodified production signal-worker.js invoked in Node; controlled raster input with exact manually supplied geometry. No browser capture, OCR, video codec, audio output, diagnostic sensitivity or clinical validation tested.'
}
(ROOT/'results/source_manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({k:manifest[k] for k in ['sha256','bytes','annotation_seconds','sample_rate_hz','record_duration_s','total_channels','independent_physical_comparison_max_error_uV','revision_tested']},indent=2))

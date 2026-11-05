"""Independent file fixtures and rejection checks for the local bridge."""
import json
import os
import shutil
import subprocess
from pathlib import Path
import struct
import tempfile
import unittest
from datetime import datetime, timezone
import numpy as np
import mne
from scipy.io import savemat
from pynwb import NWBFile, NWBHDF5IO
from pynwb.ecephys import ElectricalSeries
from convert_local import (Recording, convert, write_review, verify_review, regular_timestamps,
                           choose_format, open_recording, factor_uv)


def payload(path):
    b = Path(path).read_bytes()
    n = struct.unpack('<I', b[8:12])[0]
    h = json.loads(b[16:16+n])
    return h, np.frombuffer(b[16+n:], dtype='<f8').reshape(h['sample_count'], len(h['channels']))


def make_nicolet(folder):
    values = np.array([[10,-10],[20,-20],[32767,-32768],[0,4]], dtype='<i2')
    source = folder / 'nicolet.data'
    source.write_bytes(values.tobytes())
    source.with_suffix('.head').write_text('elec_names=[Fp1,F7]\nnum_channels=2\nnum_samples=4\nsample_freq=4\nconversion_factor=0.5\nstart_ts=2026-11-05 12:00:00.000\n')
    return source, values.astype(float)*.5


def make_set(folder, external):
    values = np.array([[1.25,-2.5,3.75,4.0],[5.25,6.5,7.75,8.0]], dtype=np.float32)
    channels = np.empty(2, dtype=[('labels', 'O')]); channels['labels'] = ['Fp1','F7']
    eeg = dict(nbchan=2, pnts=4, trials=1, srate=4., xmin=0., xmax=.75, chanlocs=channels)
    source = folder / ('external.set' if external else 'embedded.set')
    if external:
        eeg['data'] = 'external.fdt'
        (folder / 'external.fdt').write_bytes(values.T.astype('<f4').tobytes())
    else: eeg['data'] = values
    savemat(source, {'EEG': eeg})
    return source, values.T


def make_nwb(folder, *, irregular=False, multiple=False):
    nwb = NWBFile('Synthetic fixture', 'synthetic', datetime(2026,1,1,tzinfo=timezone.utc))
    dev = nwb.create_device('fixture')
    group = nwb.create_electrode_group('EEG','fixture','head',dev)
    nwb.add_electrode_column('label','EEG label')
    for label in ['F7','Fp1']:
        nwb.add_electrode(label=label, location='head', group=group)
    region = nwb.create_electrode_table_region([1,0], 'Fp1 then F7')
    values=np.array([[10,20],[30,40],[50,60],[70,80]],dtype=np.int16)
    opts={'timestamps':np.array([10.,10.25,10.6,10.75])} if irregular else {'starting_time':10.,'rate':4.}
    for name in (['raw','other'] if multiple else ['raw']):
        es=ElectricalSeries(name=name,data=values,electrodes=region,conversion=1e-6,offset=4e-6,channel_conversion=np.array([2.,3.]),**opts)
        nwb.add_acquisition(es)
    source=folder/'fixture.nwb'
    with NWBHDF5IO(str(source),'w') as io:io.write(nwb)
    return source,values*np.array([2,3])+4


def xdf_chunk(tag,data):
    b=struct.pack('<H',tag)+data
    return b'\x04'+struct.pack('<I',len(b))+b


def make_xdf(folder, *, irregular=False, missing_units=False, multiple=False, corrupt=False):
    source=folder/'fixture.xdf'
    b=b'XDF:'+xdf_chunk(1,b'<info><version>1.0</version></info>')
    for stream_id in ([1,2] if multiple else [1]):
        xml=('<info><name>Fixture</name><type>EEG</type><channel_count>2</channel_count><nominal_srate>4</nominal_srate><channel_format>float32</channel_format><desc><channels>'
             '<channel><label>Fp1</label>'+('' if missing_units else '<unit>uV</unit>')+'</channel><channel><label>F7</label><unit>mV</unit></channel>'
             '</channels></desc></info>').encode()
        b+=xdf_chunk(2,struct.pack('<I',stream_id)+xml)
        data=b'\x01\x04'
        for i in range(4):data+=b'\x08'+struct.pack('<dff',100+i/4+(.1 if irregular and i==2 else 0),i+.5,(i+1)*.01)
        if corrupt:data=data[:-2]
        b+=xdf_chunk(3,struct.pack('<I',stream_id)+data)
        b+=xdf_chunk(6,struct.pack('<I',stream_id)+b'<info><sample_count>4</sample_count></info>')
    source.write_bytes(b)
    return source


class ConversionTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.p=Path(self.tmp.name)
    def tearDown(self):self.tmp.cleanup()
    def target(self):return self.p/'out.eegreview'
    def test_fif_double_samples_events_and_voltage_channel_selection(self):
        values=np.array([[1e-6,-2e-6,3e-6,4e-6],[5e-6,6e-6,7e-6,8e-6],[0,1,0,1]],dtype=float)
        raw=mne.io.RawArray(values,mne.create_info(['Fp1','F7','STIM'],4,['eeg','eeg','stim']),first_samp=20,verbose='ERROR')
        raw.set_annotations(mne.Annotations([.25],[.1],['event']))
        source=self.p/'fixture_raw.fif';raw.save(source,fmt='double',verbose='ERROR')
        convert(source,self.target());h,data=payload(self.target())
        np.testing.assert_array_equal(data,values[:2].T*1e6)
        self.assertEqual(h['source_start_seconds'],5.)
        self.assertAlmostEqual(h['events'][0]['time'],.25)
        self.assertIn('STIM',h['warnings'][0]);verify_review(self.target())
    def test_nicolet_calibration(self):
        source,expected=make_nicolet(self.p);convert(source,self.target());h,data=payload(self.target())
        np.testing.assert_allclose(data,expected,atol=1e-10,rtol=0)
        self.assertEqual([c['label'] for c in h['channels']],['Fp1','F7'])
    @unittest.skipUnless(shutil.which('node'), 'Node is optional; needed only for browser-reader cross-check')
    def test_nicolet_and_bridge_browser_readers_match_mne(self):
        source, expected = make_nicolet(self.p)
        convert(source, self.target())
        runner = Path(__file__).resolve().parents[1] / 'cross-reader.cjs'
        result = subprocess.run(['node', str(runner), str(source), str(self.target())], check=True, capture_output=True, text=True)
        for values in json.loads(result.stdout).values():
            np.testing.assert_allclose(values, expected.T, atol=1e-10, rtol=0)
    def test_persyst_fixtures_calibration_and_rejections(self):
        source = self.p/'fixture.lay'
        data = self.p/'fixture.dat'
        text = ('[FileInfo]\nFile=fixture.dat\nDataType=0\nCalibration=0.5\nWaveformCount=2\nSamplingRate=4\n'
                '[ChannelMap]\nFp1-Ref=1\nF7-Ref=2\n[Patient]\nSex=unknown\nHand=unknown\nBirthDate=01/01/2000\nTestDate=11/05/2026\nTestTime=12:00:00\n'
                '[SampleTimes]\n0=0\n[Comments]\n0.25,0.1,0,0,Fixture event\n')
        source.write_text(text)
        values=np.array([[10,-10],[20,-20],[32767,-32768],[0,4]],dtype='<i2')
        data.write_bytes(values.tobytes())
        convert(source,self.target());h,out=payload(self.target())
        np.testing.assert_allclose(out,values*.5,atol=1e-10,rtol=0)
        self.assertEqual(h['events'][0]['text'],'Fixture event')
        self.assertAlmostEqual(h['events'][0]['time'],.25)
        self.target().unlink()
        source.write_text(text.replace('0=0','0=0\n4=10'))
        with self.assertRaisesRegex(ValueError,'SampleTimes'):convert(source,self.target())
        source.write_text(text.replace('Fp1-Ref=1\nF7-Ref=2','Fp1-Ref=2\nF7-Ref=1'))
        with self.assertRaisesRegex(ValueError,'ChannelMap'):convert(source,self.target())
        source.write_text(text);data.write_bytes(data.read_bytes()[:-1])
        with self.assertRaisesRegex(ValueError,'truncated'):convert(source,self.target())
    def test_eeglab_embedded(self):
        source,expected=make_set(self.p,False);convert(source,self.target());np.testing.assert_allclose(payload(self.target())[1],expected,atol=1e-10)
    def test_eeglab_external_companion(self):
        source,expected=make_set(self.p,True);convert(source,self.target());np.testing.assert_allclose(payload(self.target())[1],expected,atol=1e-10)
    def test_eeglab_missing_companion_stops(self):
        source,_=make_set(self.p,True);source.with_suffix('.fdt').unlink()
        with self.assertRaises(Exception):convert(source,self.target())
        self.assertFalse(self.target().exists())
    def test_nwb_calibration_offset_and_region_order(self):
        source,expected=make_nwb(self.p);convert(source,self.target());h,data=payload(self.target())
        np.testing.assert_allclose(data,expected,rtol=0,atol=1e-10)
        self.assertEqual([c['label'] for c in h['channels']],['Fp1','F7'])
        self.assertEqual(h['source_start_seconds'],10.)
    def test_nwb_multiple_requires_selection(self):
        source,_=make_nwb(self.p,multiple=True)
        with self.assertRaisesRegex(ValueError,'Select --series'):convert(source,self.target())
        convert(source,self.target(),series='/acquisition/other')
    def test_nwb_irregular_rejected(self):
        source,_=make_nwb(self.p,irregular=True)
        with self.assertRaisesRegex(ValueError,'Irregular'):convert(source,self.target())
    def test_xdf_stream_units_and_timing(self):
        source=make_xdf(self.p);convert(source,self.target());h,data=payload(self.target())
        np.testing.assert_allclose(data,np.array([[.5,10],[1.5,20],[2.5,30],[3.5,40]]),rtol=1e-6)
        self.assertEqual(h['source_start_seconds'],100.)
    def test_xdf_multiple_requires_explicit_selection(self):
        source=make_xdf(self.p,multiple=True)
        with self.assertRaisesRegex(ValueError,'Select --stream-id'):convert(source,self.target())
        convert(source,self.target(),stream_id=2)
    def test_xdf_irregular_and_missing_units_rejected(self):
        source=make_xdf(self.p,irregular=True)
        with self.assertRaisesRegex(ValueError,'Irregular'):convert(source,self.target())
        source=make_xdf(self.p,missing_units=True)
        with self.assertRaisesRegex(ValueError,'units are missing'):convert(source,self.target())
    def test_xdf_corruption_is_not_silently_repaired(self):
        source=make_xdf(self.p,corrupt=True)
        with self.assertRaises(Exception):convert(source,self.target())
        self.assertFalse(self.target().exists())
    def test_gap_annotations_rejected(self):
        raw=mne.io.RawArray(np.zeros((1,40)),mne.create_info(['Fp1'],4,'eeg'),verbose='ERROR')
        raw.set_annotations(mne.Annotations([2.],[1.],['BAD_ACQ_SKIP']))
        source=self.p/'gap_raw.fif';raw.save(source,verbose='ERROR')
        with self.assertRaisesRegex(ValueError,'gaps'):convert(source,self.target())
    def test_nonfinite_samples_leave_no_output(self):
        rec=Recording('Fixture',['Fp1'],4.,4,lambda a,z:np.array([[1],[np.nan],[2],[3]])[a:z])
        with self.assertRaisesRegex(ValueError,'non-finite'):write_review(rec,self.target())
        self.assertFalse(self.target().exists());self.assertFalse(list(self.p.glob('.eegreview-*')))
    def test_checksum_and_nonoverwrite(self):
        rec=Recording('Fixture',['Fp1'],4.,4,lambda a,z:np.array([[1],[2],[3],[4]])[a:z])
        write_review(rec,self.target());before=self.target().read_bytes()
        with self.assertRaises(FileExistsError):write_review(rec,self.target())
        self.assertEqual(self.target().read_bytes(),before)
        b=bytearray(before);b[-1]^=1;self.target().write_bytes(b)
        with self.assertRaisesRegex(ValueError,'checksum'):verify_review(self.target())
    def test_channel_subset_exact_order(self):
        rec=Recording('Fixture',['Fp1','F7'],4.,4,lambda a,z:np.array([[1,10],[2,20],[3,30],[4,40]])[a:z])
        write_review(rec,self.target(),channels=['F7','Fp1']);h,data=payload(self.target())
        np.testing.assert_array_equal(data[0],[10,1])
        self.assertEqual(h['channels'][0]['reference'],'unknown')
    def test_vendor_boundaries_explicit(self):
        for file in ['test.eeg','test.arc','test.ez3','test.erd','test.e']:
            with self.assertRaises(ValueError):choose_format(Path(file),'auto')
        self.assertEqual(choose_format(Path('test.EEG'),'nihon'),'nihon')
    def test_nihon_public_fixture_against_independent_edf(self):
        root=Path(os.environ.get('NK_FIXTURES','__not_configured__'))
        if not (root/'DA00100E.EEG').exists():self.skipTest('Public CC0 NK fixture not available')
        convert(root/'DA00100E.EEG',self.target(),fmt='nihon',encoding='gbk');h,data=payload(self.target())
        edf=mne.io.read_raw_edf(root/'DA00100E.EDF',verbose='ERROR')
        names=[c['label'] for c in h['channels']];shared=[n for n in names if n in edf.ch_names]
        self.assertGreaterEqual(len(shared),19)
        err=[]
        for name in shared:
            err.append(float(np.max(np.abs(data[:,names.index(name)]-edf.get_data(picks=[name])[0]*1e6))))
        self.assertLess(max(err),.2)
        self.assertEqual(h['sample_count'],1000);self.assertEqual(h['sample_rate'],500.)
        print('PUBLIC_NK_CHECK',len(shared),'channels; max difference',max(err),'uV; events',len(h['events']))


if __name__=='__main__':unittest.main(verbosity=2)

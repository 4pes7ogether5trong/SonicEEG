"""Score every expected screen column; never replace missing output with zero."""
import collections, json, pathlib
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = json.loads((ROOT/'spec.json').read_text())
source = np.load(ROOT/'source/excerpt.npz')
rate = spec['width']/spec['seconds_per_page']
count = int((spec['end_s']-spec['start_s'])*rate)
times = spec['start_s']+np.arange(count)/rate
source_times = float(source['start_s'])+np.arange(source['data'].shape[1])/float(source['rate'])
truth_all = np.stack([np.interp(times,source_times,row) for row in source['data']])
epochs = [('all',spec['start_s'],spec['end_s']),*[tuple(e) for e in spec['scoring']['epochs']]]

def longest_run(mask):
    padded = np.r_[False,mask,False].astype(int)
    starts,ends = np.flatnonzero(np.diff(padded)==1),np.flatnonzero(np.diff(padded)==-1)
    return int(np.max(ends-starts,initial=0))/rate

def errors(truth,recovered,mask):
    x,y = truth[mask],recovered[mask]
    if not len(x):
        return {'n':0,'rmse_uV':None,'mae_uV':None,'p95_absolute_error_uV':None,'pearson_r':None}
    delta = y-x
    corr = float(np.corrcoef(x,y)[0,1]) if len(x)>2 and np.std(x)>0 and np.std(y)>0 else None
    return {'n':len(x),'rmse_uV':float(np.sqrt(np.mean(delta**2))),'mae_uV':float(np.mean(np.abs(delta))),'p95_absolute_error_uV':float(np.quantile(np.abs(delta),.95)),'pearson_r':corr}

def stats(truth,recovered,kind,valid):
    ink,repair = kind==1,kind==2
    available = ink|repair
    return {'expected_columns':int(kind.size), 'observed_fraction':float(np.mean(ink)),
            'repaired_fraction':float(np.mean(repair)), 'missing_fraction':float(np.mean(~available)),
            'production_feature_valid_fraction':float(np.mean(valid)),
            'observed_error':errors(truth,recovered,ink),
            'repaired_error':errors(truth,recovered,repair),
            'all_recovered_error':errors(truth,recovered,available),
            'longest_missing_run_s':max(longest_run(row) for row in np.atleast_2d(~available))}

all_results, arrays = [], {}
for condition in spec['conditions']:
    name = condition['id']
    names = [str(source['names'][i]) for i in condition['channel_indices']]
    index = {name:i for i,name in enumerate(names)}
    truth = truth_all[condition['channel_indices']]
    recovered = np.full_like(truth,np.nan)
    kind = np.zeros(truth.shape,dtype=np.uint8)
    seen = np.zeros(truth.shape,dtype=bool)
    valid = np.zeros(truth.shape,dtype=bool)
    statuses = collections.Counter()
    duplicate_columns = off_grid_samples = out_of_range_samples = trace_blocks = feature_frames = worker_errors = 0
    actual_ends = {}
    feature_end = spec['start_s']
    status_frames=[]
    saved_messages=0
    for line in (ROOT/f'results/{name}.jsonl').open():
        message = json.loads(line)
        saved_messages+=1
        if message['type']=='error': worker_errors+=1
        if message['type']=='status':
            statuses[message['reason']]+=1
            status_frames.append(message['input_frame'])
        if message['type']=='traces':
            block=message['block']
            trace_blocks+=1
            actual_ends[message['input_frame']] = max(actual_ends.get(message['input_frame'],-float('inf')),block['end'])
            if not block['channels']: continue
            assert block['rate']==rate
            first=(block['start']-spec['start_s'])*rate
            if abs(first-round(first))>1e-6: off_grid_samples+=1
            begin=round(first)
            for channel in block['channels']:
                i=index[channel['name']]
                values=np.array(channel['samples'],dtype=float)
                kinds=np.array(channel['observed'],dtype=np.uint8)
                assert len(values)==len(kinds)
                assert abs((block['end']-block['start'])*rate-len(values))<1e-6
                ii=begin+np.arange(len(values))
                inside=(ii>=0)&(ii<count)
                out_of_range_samples+=int(np.sum(~inside))
                ii,values,kinds=ii[inside],values[inside],kinds[inside]
                duplicate_columns+=int(np.sum(seen[i,ii]))
                seen[i,ii]=True
                recovered[i,ii]=values
                kind[i,ii]=np.where(np.isfinite(values),kinds,0)
        if message['type']=='frame':
            frame=message['frame']; feature_frames+=1
            assert frame['end']>=frame['start']
            feature_end=max(feature_end,frame['end'])
            for channel in frame['channels']:
                if channel['name'] not in index: continue
                if channel.get('valid'):
                    a=max(0,round((frame['start']-spec['start_s'])*rate))
                    b=min(count,round((frame['end']-spec['start_s'])*rate))
                    valid[index[channel['name']],a:b]=True
    # Validate declared timestamps independently of recovered voltages.
    run=json.loads((ROOT/f'results/{name}_run.json').read_text())
    assert saved_messages==run['messages'],(name,saved_messages,run['messages'])
    assert status_frames==list(range(int((spec['end_s']-spec['start_s'])*spec['fps'])+1)),(name,'incomplete frame log')
    timestamp_errors=[abs(end-(spec['start_s']+frame/spec['fps'])) for frame,end in actual_ends.items()]
    audit={'duplicate_output_columns':duplicate_columns,'blocks_off_expected_sample_grid':off_grid_samples,
           'out_of_range_output_columns':out_of_range_samples,'worker_errors':worker_errors,
           'max_trace_end_vs_input_clock_error_s':max(timestamp_errors,default=None),
           'last_trace_end_s':max(actual_ends.values(),default=None),
           'last_feature_end_s':feature_end,'trace_blocks':trace_blocks,'feature_frames':feature_frames,
           'input_status_counts':dict(statuses),'saved_messages_verified':saved_messages,'input_status_frames_verified':len(status_frames)}
    assert worker_errors==0 and duplicate_columns==0 and off_grid_samples==0 and out_of_range_samples==0,audit
    assert max(timestamp_errors,default=0)<1e-7,audit
    result={'condition':name,'channels':names,'configuration':condition,'timeline_audit':audit,'epochs':{}}
    for epoch,a,b in epochs:
        interval=(times>=a)&(times<b)
        combined=stats(truth[:,interval],recovered[:,interval],kind[:,interval],valid[:,interval])
        per_channel={n:stats(truth[i,interval],recovered[i,interval],kind[i,interval],valid[i,interval]) for i,n in enumerate(names)}
        correlations=[s['observed_error']['pearson_r'] for s in per_channel.values() if s['observed_error']['pearson_r'] is not None]
        combined['median_channel_pearson_r']=float(np.median(correlations)) if correlations else None
        result['epochs'][epoch]={'start_s':a,'end_s':b,'pooled':combined,'by_channel':per_channel}
    all_results.append(result)
    np.savez_compressed(ROOT/f'results/{name}_aligned.npz',times=times,truth_uV=truth,recovered_uV=recovered,observed=kind,production_feature_valid=valid,names=np.array(names))
    arrays[name]={'truth':truth,'recovered':recovered,'kind':kind,'names':names}

(ROOT/'results/metrics.json').write_text(json.dumps({'spec':spec,'results':all_results},indent=2,allow_nan=False)+'\n')

# The same lead and preselected windows in every condition; retain gaps in the plotted output.
windows=[('Before annotation',2990,2993),('Annotated seizure',3010,3013),('After annotation',3045,3048)]
fig,axes=plt.subplots(3,3,figsize=(15,9),sharex='col',sharey='col',layout='constrained')
labels={'isolated_2uv':'Isolated F7–T7 · 2 µV/pixel','dense_2uv':'18 channels · 2 µV/pixel','dense_6uv':'18 channels · 6 µV/pixel'}
for r,condition in enumerate(spec['conditions']):
    name=condition['id']; a=arrays[name]; i=a['names'].index('F7-T7')
    for col,(label,start,end) in enumerate(windows):
        ax=axes[r,col]; mask=(times>=start)&(times<end)
        ax.plot(times[mask],a['truth'][i,mask],color='#7b8794',lw=1.3,label='Original EEG at column times',zorder=1)
        rec=np.where(a['kind'][i]==1,a['recovered'][i],np.nan)
        ax.plot(times[mask],rec[mask],color='#007c91',lw=1,label='SonicEEG observed',zorder=2)
        repaired=mask&(a['kind'][i]==2)
        ax.scatter(times[repaired],a['recovered'][i,repaired],s=8,color='#d77b18',label='SonicEEG repaired',zorder=3)
        ax.axhline(0,color='#e2e6eb',lw=.6,zorder=0)
        ax.set_xlim(start,end); ax.spines[['top','right']].set_visible(False)
        # Negative voltage is upward, matching the actual rendered images.
        if r==0:
            ax.set_title(label+'\n'+f'{start}–{end} s',fontsize=11)
        if col==0: ax.set_ylabel(labels[name]+'\nVoltage (µV)',fontsize=10)
        if r==2: ax.set_xlabel('Time from EDF start (s)')
for col in range(3): axes[0,col].invert_yaxis()
handles,legend_labels=axes[0,0].get_legend_handles_labels()
fig.legend(handles,legend_labels,loc='outside lower center',ncol=3,frameon=False)
fig.suptitle('Known EEG → controlled pixels → unchanged SonicEEG worker\nF7–T7; gaps are left visible; no lag or gain fitted',fontsize=15)
fig.savefig(ROOT/'results/reconstruction_comparison.png',dpi=145)
plt.close(fig)

fig,axes=plt.subplots(3,1,figsize=(13,6),sharex=True,layout='constrained')
for ax,condition in zip(axes,spec['conditions']):
    a=arrays[condition['id']]
    # Exactly one-second bins, averaged over channels.
    bins=(a['kind']==1).reshape(len(a['names']),110,180).mean(axis=(0,2))*100
    ax.step(np.arange(2960,3070)+.5,bins,where='mid',color='#007c91',lw=1.5)
    ax.axvspan(2996,3036,color='#c586bd',alpha=.18)
    ax.set_ylim(0,103); ax.set_ylabel('Observed %'); ax.set_title(labels[condition['id']],loc='left',fontsize=11)
    ax.spines[['top','right']].set_visible(False)
axes[-1].set_xlabel('Time from EDF start (s); shaded interval is the supplied seizure annotation')
fig.suptitle('Coverage includes every expected channel and screen column',fontsize=14)
fig.savefig(ROOT/'results/coverage_timeline.png',dpi=145)
plt.close(fig)

summary=[]
for result in all_results:
    for epoch in ['all','annotated_seizure']:
        m=result['epochs'][epoch]['pooled']
        summary.append({'condition':result['condition'],'epoch':epoch,'observed_pct':round(100*m['observed_fraction'],3),'repaired_pct':round(100*m['repaired_fraction'],3),'missing_pct':round(100*m['missing_fraction'],3),'rmse_observed_uV':m['observed_error']['rmse_uV'],'median_channel_r':m['median_channel_pearson_r'],'production_valid_pct':round(100*m['production_feature_valid_fraction'],3),'longest_missing_s':m['longest_missing_run_s']})
print(json.dumps(summary,indent=2))

"""Render a deterministic sweep of real EDF voltages to raw RGBA on stdout."""
import argparse, json, pathlib, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('condition')
parser.add_argument('--frames',type=int,default=None)
args = parser.parse_args()
spec = json.loads((ROOT/'spec.json').read_text())
condition = next(c for c in spec['conditions'] if c['id']==args.condition)
src = np.load(ROOT/'source/excerpt.npz')
data, rate, source_start = src['data'], int(src['rate']), float(src['start_s'])
width,height,S = spec['width'],condition['height'],spec['supersampling']
screen_rate = width / spec['seconds_per_page']
page_cache = {}

def page(start):
    if start in page_cache:
        return page_cache[start]
    canvas = Image.new('RGB',(width*S,height*S),'white')
    draw = ImageDraw.Draw(canvas)
    center = (S-1)/2
    for x in range(0,width,int(screen_rate)):
        draw.line([(x*S+center,0),(x*S+center,height*S)], fill=tuple(spec['grid_rgb']),width=S)
    # Render all 256-Hz source samples as a polyline; do not prefilter or infer missing voltages.
    # Include one point outside each page edge so the line has the correct boundary slope.
    a,b = int((start-source_start)*rate)-1, int((start+spec['seconds_per_page']-source_start)*rate)+1
    indices = np.arange(max(0,a),min(data.shape[1],b))
    x = (source_start+indices/rate-start)*screen_rate
    for row,ch in enumerate(condition['channel_indices']):
        y = condition['baseline_px']+row*condition['row_spacing_px']+data[ch,indices]/condition['uv_per_pixel']
        points = list(zip(x*S+center,y*S+center))
        draw.line(points,fill=tuple(spec['trace_rgb']),width=int(S*spec['trace_width_px']),joint='curve')
    image = np.asarray(canvas.resize((width,height),Image.Resampling.LANCZOS).convert('RGBA')).copy()
    page_cache[start] = image
    for old in list(page_cache):
        if old < start-2*spec['seconds_per_page']:
            del page_cache[old]
    return image

count = int((spec['end_s']-spec['start_s'])*spec['fps'])+1
if args.frames is not None:
    count = min(count,args.frames)
out = sys.stdout.buffer
for frame in range(count):
    # Integer column arithmetic prevents accidental floating-point cursor rounding.
    total = spec['initial_cursor_px']+int(frame*screen_rate/spec['fps'])
    page_index,cursor = divmod(total,width)
    start = spec['start_s']+page_index*spec['seconds_per_page']
    current,previous = page(start),page(start-spec['seconds_per_page'])
    image = previous.copy()
    image[:,:cursor] = current[:,:cursor]
    image[:,cursor:cursor+spec['cursor_width_px'],:3] = spec['cursor_rgb']
    if frame in [0,76,156]:
        Image.fromarray(image).save(ROOT/f'results/{args.condition}_frame_{frame:03d}.png')
    out.write(image.tobytes())
out.flush()

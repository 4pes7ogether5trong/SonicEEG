import { BrowserCapture } from '../capture.js';
import { FluidField } from '../field.js';
import { TemporalHistory } from '../history.js';
import { ChannelCoverage } from '../channel-coverage.js';

const $ = (id) => document.getElementById(id);
const canvas = $('source'),
  ctx = canvas.getContext('2d');
const rows = [
  { name: 'F7-T7', y: 60 },
  { name: 'F8-T8', y: 180 },
];
const history = new TemporalHistory(),
  coverage = new ChannelCoverage(rows.map((r) => r.name));
let capture, worker, drawTimer, readTimer, start, pending, field;
const result = {
  running: false,
  frames: 0,
  validFrames: 0,
  missingFrames: 0,
  recoveredAfterGap: false,
  cloudCompositeDraws: 0,
  maxRenderMs: 0,
  renderer: '',
  lastEnd: 0,
  peaks: [],
  errors: [],
};
function show() {
  $('results').textContent = JSON.stringify(
    {
      ...result,
      coverage: coverage
        .snapshot()
        .map(({ name, usable, percent, longestGap }) => ({ name, usable, percent, longestGap })),
    },
    null,
    2,
  );
}
function draw() {
  const time = (performance.now() - start) / 1000 + 0.625;
  const page = Math.floor(time / 8) * 8,
    cursor = Math.floor((time % 8) * 128);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, 1024, 240);
  rows.forEach((row, i) => {
    ctx.beginPath();
    ctx.strokeStyle = '#152331';
    ctx.lineWidth = 1.3;
    let pen = false;
    for (let x = 0; x < 1024; x++) {
      const t = page + x / 128 - (x >= cursor ? 8 : 0);
      if (t >= 16 && t < 16.75) {
        pen = false;
        continue;
      }
      const y = row.y + 12 * Math.sin(2 * Math.PI * (i ? 7.3 : 10.1) * t);
      if (pen) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      pen = true;
    }
    ctx.stroke();
  });
  ctx.fillStyle = '#ffda00';
  ctx.fillRect(cursor, 0, 3, 240);
}
function stop() {
  clearInterval(drawTimer);
  clearInterval(readTimer);
  capture?.stop();
  worker?.terminate();
  result.running = false;
  $('status').textContent = 'Stopped';
  show();
}
$('stop').onclick = stop;
$('run').onclick = async () => {
  $('run').disabled = true;
  result.running = true;
  start = performance.now();
  draw();
  try {
    field = new FluidField(
      $('stage'),
      () => {},
      (s) => (result.renderer = s),
    );
    if (field.software) {
      const context = field.software,
        original = context.drawImage.bind(context);
      context.drawImage = (...args) => {
        result.cloudCompositeDraws++;
        return original(...args);
      };
    }
    capture = new BrowserCapture();
    capture.stream = canvas.captureStream(8);
    capture.video.srcObject = capture.stream;
    await capture.video.play();
    worker = new Worker(new URL('../signal-worker.js', import.meta.url), { type: 'module' });
    worker.onerror = (e) => {
      result.errors.push(e.message);
      show();
    };
    worker.onmessage = ({ data: m }) => {
      if (m.type === 'ready' || m.type === 'status') pending = false;
      if (m.type === 'error') result.errors.push(m.message);
      if (m.type === 'frame') {
        const f = m.frame;
        history.add(f);
        coverage.ingest(f);
        result.frames++;
        result.lastEnd = f.end;
        if (f.channels.every((c) => c.valid) && f.channels.length) {
          result.validFrames++;
          result.peaks = f.channels.map((c) => c.peakHz);
          if (f.end > 20) result.recoveredAfterGap = true;
        } else result.missingFrames++;
        const before = performance.now();
        field.update(history.overview(8), {
          map: 'frequency',
          mode: 'history',
          relief: true,
          fluid: true,
          animate: true,
          frozen: false,
          dropletsFor: () => [],
          monochrome: false,
          band: -1,
          selected: '',
          scale: 80,
          lens: 0.5,
          focus: history.end,
          total: history.end,
          cut: 20,
        });
        result.maxRenderMs = Math.max(result.maxRenderMs, performance.now() - before);
      }
      show();
    };
    pending = true;
    worker.postMessage({
      type: 'configure',
      config: {
        rows,
        seconds: 8,
        uvPerPixel: 2,
        negativeUp: true,
        mode: 'auto',
        expected: [],
        settings: {},
        segment: 'known-source',
      },
    });
    drawTimer = setInterval(draw, 125);
    readTimer = setInterval(() => {
      if (performance.now() - start > 28000) {
        stop();
        return;
      }
      if (pending) return;
      const c = capture.crop({ x: 0, y: 0, w: 1, h: 1 });
      const im = c.getContext('2d').getImageData(0, 0, c.width, c.height);
      pending = true;
      worker.postMessage(
        {
          type: 'pixels',
          width: c.width,
          height: c.height,
          buffer: im.data.buffer,
          wall: performance.now() / 1000,
        },
        [im.data.buffer],
      );
      c.width = c.height = 0;
    }, 500);
    $('status').textContent = 'Running; intentional missing interval at 16–16.75 seconds';
  } catch (e) {
    result.errors.push(e.message);
    stop();
  }
};

import { extractTraces, TraceTracker, SweepCursor } from './pixels.js';
import { ScreenStitcher } from './stitch.js';
import { FeaturePipeline } from './pipeline.js';
import { traceBlock } from './trace-monitor.js';
let config,
  stitcher,
  cursorTracker,
  traceTracker,
  pipeline,
  usableChannels = null,
  capturedEnd = 0,
  publishedEnd = 0;
self.onmessage = ({ data: m }) => {
  try {
    if (m.type === 'configure') {
      config = m.config;
      stitcher = new ScreenStitcher({ ...config, cursorMargin: 6 });
      cursorTracker = new SweepCursor();
      traceTracker = new TraceTracker();
      stitcher.time = m.offset || 0;
      publishedEnd = stitcher.time;
      capturedEnd = stitcher.time;
      usableChannels = null;
      pipeline = new FeaturePipeline((frame) => {
        publishedEnd = frame.end;
        usableChannels = frame.channels.filter((c) => c.valid && c.status === 'observed').length;
        postMessage({ type: 'frame', frame });
      });
      postMessage({ type: 'ready' });
      return;
    }
    if (m.type !== 'pixels' || !config) return;
    const image = {
      width: m.width,
      height: m.height,
      data: new Uint8ClampedArray(m.buffer),
    };
    const channels =
        config.trackPaths === false
          ? extractTraces(image, config.rows, config)
          : traceTracker.extract(image, config.rows, config, m.wall),
      cursor = config.mode !== 'scroll' ? cursorTracker.find(image) : null;
    const block = stitcher.push(channels, m.wall, cursor);
    for (const part of block.segments || [block]) {
      if (part.gap) {
        const end = block.segments ? part.start + part.duration : stitcher.time;
        if (end > capturedEnd)
          postMessage({
            type: 'traces',
            block: {
              start: capturedEnd,
              end,
              channels: [],
              segment: config.segment,
              settings: config.settings,
              negativeUp: config.negativeUp,
            },
          });
        capturedEnd = end;
      }
      if (part.channels) {
        const captured = traceBlock(part, config);
        capturedEnd = captured.end;
        postMessage({ type: 'traces', block: captured });
      }
      if (part.gap)
        pipeline.gap(
          publishedEnd,
          block.segments ? part.start + part.duration : stitcher.time,
          config.settings,
          config.segment,
          'screen',
          part.expectedRedraw === true,
        );
      if (part.channels)
        pipeline.ingest(part, {
          settings: config.settings,
          segment: config.segment,
          source: 'screen',
          expected: config.expected,
          flush: part.flush === true,
        });
    }
    const newChannels = block.channels || block.segments?.findLast((p) => p.channels)?.channels;
    postMessage({
      type: 'status',
      mode: stitcher.mode,
      reason: block.reason || 'New EEG columns reconstructed',
      accepted: !!newChannels,
      gap: !!block.gap,
      expectedRedraw: block.expectedRedraw === true,
      usableChannels,
      channels: (newChannels || channels).map((c) => ({
        name: c.name,
        quality: c.quality,
        clipped: c.clipped,
        valid: c.valid,
      })),
    });
  } catch {
    postMessage({
      type: 'error',
      message:
        'The selected screen region could not be reconstructed. Review the crop and calibration.',
    });
  }
};

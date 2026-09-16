import { extractTraces, findSweepCursor } from './pixels.js';
import { ScreenStitcher } from './stitch.js';
import { FeaturePipeline } from './pipeline.js';
let config,
  stitcher,
  pipeline,
  publishedEnd = 0;
self.onmessage = ({ data: m }) => {
  try {
    if (m.type === 'configure') {
      config = m.config;
      stitcher = new ScreenStitcher(config);
      stitcher.time = m.offset || 0;
      publishedEnd = stitcher.time;
      pipeline = new FeaturePipeline((frame) => {
        publishedEnd = frame.end;
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
    const channels = extractTraces(image, config.rows, config),
      cursor = config.mode === 'sweep' ? findSweepCursor(image) : null;
    const block = stitcher.push(channels, m.wall, cursor);
    if (block.gap)
      pipeline.gap(
        publishedEnd,
        stitcher.time,
        config.settings,
        config.segment,
        'screen',
      );
    if (block.channels)
      pipeline.ingest(block, {
        settings: config.settings,
        segment: config.segment,
        source: 'screen',
        expected: config.expected,
      });
    postMessage({
      type: 'status',
      reason: block.reason || 'New EEG columns reconstructed',
      accepted: !!block.channels,
      gap: !!block.gap,
      channels: channels.map((c) => ({
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

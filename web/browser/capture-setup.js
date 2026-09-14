import { parseDerivation, auxiliaryChannel } from './montage.js';

export function channelFieldText(current, recognized, manuallyEdited) {
  // Deleting the old result releases the field for a new read. An empty or
  // failed read must not erase useful names already entered by the operator.
  return recognized.trim() && (!manuallyEdited || !current.trim()) ? recognized : current;
}

// Names and positions are separate inputs. Typing a name must not require OCR
// to have read that name, and it must not silently invent evenly spaced rows.
export function enteredChannels(text) {
  const lines = String(text)
    .split(/[\n;,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error('Enter the channel names, one per visible row.');
  const rows = lines.map((line, i) => {
    const auxiliary = auxiliaryChannel(line);
    if (auxiliary) return auxiliary;
    const parsed = parseDerivation(line);
    if (!parsed)
      throw new Error(
        `Row ${i + 1}: use an electrode pair such as F7-T7, or SKIP for a non-EEG row.`,
      );
    return parsed;
  });
  const eeg = rows.filter((r) => !r.ignore);
  if (!eeg.length) throw new Error('At least one EEG channel is needed.');
  const seen = new Set();
  for (const row of eeg) {
    if (seen.has(row.name))
      throw new Error(
        `Duplicate channel ${row.name}. Keep one name per visible row; use SKIP for an unused duplicate.`,
      );
    seen.add(row.name);
  }
  return rows;
}

export function positionedChannels(channels, positions, labelRect, plot, dimensions, offset = 0) {
  if (!plot)
    throw new Error(
      'The waveform area is not located yet. Draw its box under Adjust regions manually.',
    );
  if (channels.length !== positions.length)
    throw new Error(
      `${channels.length} names entered, but ${positions.length} row positions located. Adjust the label box to include every named row.`,
    );
  const height = Math.round(plot.h * dimensions[1]);
  const rows = channels.map((channel, i) => ({
    name: channel.name,
    ignore: channel.ignore === true,
    labelInferred: positions[i].inferred === true && positions[i].name === channel.name,
    y: ((labelRect.y + positions[i].y * labelRect.h - plot.y) / plot.h) * height + offset,
  }));
  if (
    rows.some(
      (r, i) => !Number.isFinite(r.y) || r.y < 0 || r.y >= height || (i && r.y <= rows[i - 1].y),
    )
  )
    throw new Error(
      'Some channel positions fall outside the waveform box or overlap. Adjust the label and waveform boxes.',
    );
  return rows;
}

// Call from the click gesture, but never make visual capture wait for an audio
// permission promise. Report a rejected or indefinitely pending sound request.
export async function startCaptureWithSound({
  enableSound,
  startCapture,
  soundState,
  graceMs = 2500,
}) {
  let pending;
  try {
    pending = Promise.resolve(enableSound());
  } catch (error) {
    pending = Promise.reject(error);
  }
  const timer = setTimeout(() => soundState('pending'), graceMs);
  pending.then(
    () => {
      clearTimeout(timer);
      soundState('ready');
    },
    () => {
      clearTimeout(timer);
      soundState('unavailable');
    },
  );
  return startCapture();
}

import { parseDerivation, auxiliaryChannel } from './montage.js';

// A manually copied troubleshooting report contains dimensions and allowed
// channel names only. Never include raw OCR text, track IDs, images or samples.
export function labelCheckReport(result, suggestions, dimensions) {
  const finite = (value) => (Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null);
  const name = (value) => parseDerivation(value)?.name || auxiliaryChannel(value)?.name || '?';
  return JSON.stringify(
    {
      format: 'soniceeg-label-check-3',
      capturePixels: dimensions.map(finite),
      selectionPixels: result.imageSize?.map(finite) || [],
      labelHeightPixels: finite(result.column?.glyphHeight),
      rowsDetected: result.rows.length,
      namesRead: result.rows.filter((row) => name(row.name) !== '?').length,
      inferred: suggestions.inferred,
      rows: result.rows.map((row, i) => ({
        row: i + 1,
        read: name(row.name),
        proposed: name(suggestions.rows[i]?.name),
        y: finite(row.y),
      })),
    },
    null,
    2,
  );
}

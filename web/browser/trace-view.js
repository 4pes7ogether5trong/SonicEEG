import { traceRuns } from './trace-monitor.js';

export function traceVerticalOffset(voltage, scale, negativeUp = true) {
  return ((negativeUp ? 1 : -1) * voltage) / scale;
}

// One shared scale across leads. Auto-fit includes every finite visible sample,
// not a percentile that would conceal large deflections or select a quiet lead.
export function traceDisplayScale(rows, requested = 0) {
  if (Number.isFinite(requested) && requested > 0) return requested;
  let peak = 0;
  for (const row of rows) {
    const from = Math.max(0, row.end - 4);
    for (const fragment of row.fragments || [])
      for (let i = 0; i < fragment.samples.length; i++) {
        const time = fragment.start + i / fragment.rate;
        const value = fragment.samples[i];
        if (time >= from && time < row.end && fragment.observed[i] && Number.isFinite(value))
          peak = Math.max(peak, Math.abs(value));
      }
  }
  return 40 * 2 ** Math.max(0, Math.ceil(Math.log2(Math.max(40, peak) / 40)));
}

export function drawTraceMonitor(canvas, rows, { scale = 80 } = {}) {
  const width = 840,
    rowHeight = 54,
    left = 105,
    right = width - 12;
  canvas.width = width;
  canvas.height = Math.max(70, 30 + rows.length * rowHeight);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101a2c';
  ctx.fillRect(0, 0, width, canvas.height);
  ctx.font = '17px system-ui';
  const end = rows[0]?.end || 0,
    from = Math.max(0, end - 4),
    duration = Math.max(0.01, end - from);
  ctx.fillStyle = '#c0cedf';
  ctx.fillText(
    `${from.toFixed(1)}–${end.toFixed(1)} s · ±${scale} µV · negative ${rows[0]?.negativeUp === false ? 'down' : 'up'} · live`,
    left,
    19,
  );
  if (!rows.length) ctx.fillText('Waiting for newly captured columns', left, 53);
  const xAt = (time) => left + ((right - left) * (time - from)) / duration;
  rows.forEach((row, index) => {
    const top = 30 + index * rowHeight,
      mid = top + rowHeight / 2;
    ctx.fillStyle = '#c0cedf';
    ctx.fillText(row.name, 5, mid + 5);
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top + 2, right - left, rowHeight - 4);
    ctx.clip();
    ctx.strokeStyle = '#36404e';
    ctx.lineWidth = 1;
    for (let x = left - rowHeight; x < right; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x, top + rowHeight);
      ctx.lineTo(x + rowHeight, top);
      ctx.stroke();
    }
    for (const run of traceRuns(row, from, end)) {
      const first = run.points[0],
        last = run.points.at(-1);
      ctx.fillStyle = '#142338';
      ctx.fillRect(
        xAt(first.time),
        top + 2,
        Math.max(1, xAt(last.time) - xAt(first.time)),
        rowHeight - 4,
      );
      ctx.strokeStyle = run.kind === 2 ? '#efbd7b' : '#72d9ed';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      run.points.forEach((point, i) => {
        const x = xAt(point.time),
          y = mid + traceVerticalOffset(point.value, scale, row.negativeUp) * (rowHeight / 2 - 4);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        if (run.points.length === 1) ctx.fillRect(x, y, 1.5, 1.5);
      });
      ctx.stroke();
    }
    ctx.strokeStyle = '#466079';
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo(left, mid);
    ctx.lineTo(right, mid);
    ctx.stroke();
    ctx.restore();
  });
}

"use strict";

const BAND_COLORS = {
  delta: "#9477ed",
  theta: "#55b8e8",
  alpha: "#78f2c2",
  beta: "#f0ae57",
  gamma: "#ee6aab",
};
const BAND_ORDER = ["delta", "theta", "alpha", "beta", "gamma"];
const FREQUENCY_RINGS = [0.5, 4, 8, 13, 30, 45];

const ui = {
  constellation: document.querySelector("#constellation"),
  traces: document.querySelector("#traces"),
  traceScroller: document.querySelector("#traceScroller"),
  connectionDot: document.querySelector("#connectionDot"),
  connectionText: document.querySelector("#connectionText"),
  sourceLabel: document.querySelector("#sourceLabel"),
  channelCount: document.querySelector("#channelCount"),
  sampleRate: document.querySelector("#sampleRate"),
  windowLength: document.querySelector("#windowLength"),
  voltageStatus: document.querySelector("#voltageStatus"),
  ageControl: document.querySelector("#ageControl"),
  ageOutput: document.querySelector("#ageOutput"),
  pauseButton: document.querySelector("#pauseButton"),
  resetButton: document.querySelector("#resetButton"),
  liveLayer: document.querySelector("#liveLayer"),
  recentLayer: document.querySelector("#recentLayer"),
  densityLayer: document.querySelector("#densityLayer"),
  referenceLayer: document.querySelector("#referenceLayer"),
  frameClock: document.querySelector("#frameClock"),
  warningText: document.querySelector("#warningText"),
  schemaLabel: document.querySelector("#schemaLabel"),
  focusName: document.querySelector("#focusName"),
  focusFrequency: document.querySelector("#focusFrequency"),
  focusRms: document.querySelector("#focusRms"),
  focusRhythm: document.querySelector("#focusRhythm"),
  focusQuality: document.querySelector("#focusQuality"),
  bandBars: document.querySelector("#bandBars"),
};

const state = {
  frame: null,
  lastFrameId: null,
  paused: false,
  staticDemo: false,
  requestFailures: 0,
  recent: new Map(),
  accumulated: [],
  hitTargets: [],
  focused: null,
  mouse: { x: -1000, y: -1000 },
  renderDirty: true,
};

function resizeCanvas(canvas, cssHeight) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(cssHeight));
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function frequencyNorm(frequency) {
  const clipped = Math.max(0.5, Math.min(45, frequency || 0.5));
  return Math.log(clipped / 0.5) / Math.log(45 / 0.5);
}

function coordinates(entry, width, height) {
  const centerX = width / 2;
  const centerY = height / 2 + 8;
  const outer = Math.max(90, Math.min(width, height) * 0.40);
  const inner = outer * 0.18;
  const radius = inner + frequencyNorm(entry.dominant_frequency_hz) * (outer - inner);
  const theta = entry.angle_rad;
  const tangentLimit = Math.min(24, (2 * Math.PI * Math.max(radius, 1) / Math.max(8, state.frame?.channels.length || 19)) * 0.28);
  const slip = (entry.signed_voltage || 0) * tangentLimit;
  return {
    x: centerX + Math.cos(theta) * radius - Math.sin(theta) * slip,
    y: centerY + Math.sin(theta) * radius + Math.cos(theta) * slip,
    centerX,
    centerY,
    outer,
    inner,
    radius,
  };
}

function densityCoordinates(entry, width, height) {
  return coordinates({
    dominant_frequency_hz: 0.5 * Math.pow(90, entry.frequencyNorm),
    angle_rad: entry.angle,
    signed_voltage: entry.voltage,
  }, width, height);
}

function consumeFrame(frame) {
  if (state.paused || frame.frame_id === state.lastFrameId) return;
  state.frame = frame;
  state.lastFrameId = frame.frame_id;
  for (const channel of frame.channels) {
    const history = state.recent.get(channel.name) || [];
    history.push({
      angle: channel.angle_rad,
      frequencyNorm: frequencyNorm(channel.dominant_frequency_hz),
      voltage: channel.signed_voltage,
      color: BAND_COLORS[channel.dominant_band] || "#78f2c2",
      quality: channel.quality,
    });
    if (history.length > 42) history.shift();
    state.recent.set(channel.name, history);
    state.accumulated.push(history[history.length - 1]);
  }
  if (state.accumulated.length > 12000) state.accumulated.splice(0, state.accumulated.length - 12000);
  state.renderDirty = true;
  updateReadouts(frame);
}

function updateReadouts(frame) {
  ui.sourceLabel.textContent = frame.source_label;
  ui.channelCount.textContent = String(frame.channels.length);
  ui.sampleRate.textContent = `${frame.sample_rate_hz.toFixed(1)} Hz`;
  ui.windowLength.textContent = `${frame.window_seconds.toFixed(2)} s`;
  const calibrated = frame.channels.every((channel) => channel.voltage_calibrated);
  ui.voltageStatus.textContent = calibrated ? frame.channels[0]?.voltage_unit || "calibrated" : "relative / uncalibrated";
  ui.frameClock.textContent = `Frame ${frame.frame_id} · t ${frame.timestamp_s.toFixed(2)} s`;
  ui.schemaLabel.textContent = frame.schema;
  ui.ageControl.value = String(Math.round(frame.patient_age_years));
  ui.ageOutput.value = `${Math.round(frame.patient_age_years)} y`;
  ui.ageOutput.textContent = ui.ageOutput.value;
  const warnings = frame.warnings || [];
  ui.warningText.textContent = warnings.length
    ? warnings.join(" ")
    : "No clinical classifications are emitted in v1. Candidate flags describe signal integrity only.";
}

function drawConstellation() {
  const height = parseFloat(getComputedStyle(ui.constellation).height) || 485;
  const { ctx, width } = resizeCanvas(ui.constellation, height);
  ctx.clearRect(0, 0, width, height);
  if (!state.frame) {
    ctx.fillStyle = "#718c86";
    ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("WAITING FOR A VALID SIGNAL FRAME", width / 2, height / 2);
    return;
  }

  const channels = state.frame.channels;
  const geometry = coordinates(channels[0], width, height);
  const { centerX, centerY, outer, inner } = geometry;

  ctx.save();
  ctx.lineWidth = 1;
  for (const freq of FREQUENCY_RINGS) {
    const radius = inner + frequencyNorm(freq) * (outer - inner);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = freq === 0.5 || freq === 45 ? "rgba(137,209,191,.18)" : "rgba(137,209,191,.10)";
    ctx.stroke();
    ctx.fillStyle = "rgba(142,168,162,.62)";
    ctx.font = "9px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`${freq} Hz`, centerX + radius + 4, centerY - 3);
  }

  for (const channel of channels) {
    const theta = channel.angle_rad;
    ctx.beginPath();
    ctx.moveTo(centerX + Math.cos(theta) * inner, centerY + Math.sin(theta) * inner);
    ctx.lineTo(centerX + Math.cos(theta) * outer, centerY + Math.sin(theta) * outer);
    ctx.strokeStyle = "rgba(137,209,191,.055)";
    ctx.stroke();
  }
  ctx.restore();

  if (ui.densityLayer.checked) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const entry of state.accumulated) {
      const point = densityCoordinates(entry, width, height);
      ctx.fillStyle = `${entry.color}0a`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (ui.referenceLayer.checked) drawReference(ctx, width, height, channels);
  if (ui.recentLayer.checked) drawRecent(ctx, width, height);
  if (ui.liveLayer.checked) drawLive(ctx, width, height, channels);
  drawChannelLabels(ctx, centerX, centerY, outer, channels);
}

function drawReference(ctx, width, height, channels) {
  const targets = state.frame.age_reference?.regional_frequency_targets_hz || {};
  const ordered = [...channels].sort((left, right) => left.angle_rad - right.angle_rad);
  ctx.save();
  ctx.setLineDash([3, 6]);
  ctx.strokeStyle = "rgba(120,242,194,.5)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ordered.forEach((channel, index) => {
    const target = targets[channel.region] || state.frame.age_reference.posterior_rhythm_reference_hz || 10;
    const point = coordinates({ ...channel, dominant_frequency_hz: target, signed_voltage: 0 }, width, height);
    if (index === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawRecent(ctx, width, height) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const history of state.recent.values()) {
    if (history.length < 2) continue;
    for (let index = 1; index < history.length; index += 1) {
      const previous = densityCoordinates(history[index - 1], width, height);
      const current = densityCoordinates(history[index], width, height);
      const alpha = (index / history.length) * 0.34 * current.quality;
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(current.x, current.y);
      ctx.strokeStyle = `${history[index].color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawLive(ctx, width, height, channels) {
  state.hitTargets = [];
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const channel of channels) {
    const point = coordinates(channel, width, height);
    const dominance = Math.max(...Object.values(channel.band_powers));
    const radius = 3.2 + dominance * 7.5;
    const color = BAND_COLORS[channel.dominant_band] || "#78f2c2";
    const alpha = 0.25 + 0.75 * channel.quality;

    ctx.shadowColor = color;
    ctx.shadowBlur = 4 + dominance * 13;
    ctx.fillStyle = `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.setLineDash(channel.rhythmicity > 0.35 ? [] : [1.5, 2.5]);
    ctx.strokeStyle = `rgba(232,245,241,${0.28 + channel.rhythmicity * 0.55})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius + 2.5, 0, Math.PI * 2);
    ctx.stroke();

    const satelliteRadius = radius + 6;
    const satelliteX = point.x + Math.cos(channel.phase_rad) * satelliteRadius;
    const satelliteY = point.y + Math.sin(channel.phase_rad) * satelliteRadius;
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(232,245,241,${alpha})`;
    ctx.beginPath();
    ctx.arc(satelliteX, satelliteY, 1.3, 0, Math.PI * 2);
    ctx.fill();

    state.hitTargets.push({ x: point.x, y: point.y, radius: Math.max(11, radius + 5), channel });
  }
  ctx.restore();
  updateFocusFromMouse();
}

function drawChannelLabels(ctx, centerX, centerY, outer, channels) {
  ctx.save();
  ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
  for (const channel of channels) {
    const theta = channel.angle_rad;
    const x = centerX + Math.cos(theta) * (outer + 18);
    const y = centerY + Math.sin(theta) * (outer + 18);
    ctx.textAlign = Math.cos(theta) > 0.18 ? "left" : Math.cos(theta) < -0.18 ? "right" : "center";
    ctx.textBaseline = Math.sin(theta) > 0.7 ? "top" : Math.sin(theta) < -0.7 ? "bottom" : "middle";
    ctx.fillStyle = state.focused?.name === channel.name ? "#e8f5f1" : "rgba(142,168,162,.75)";
    ctx.fillText(channel.name, x, y);
  }
  ctx.restore();
}

function drawTraces() {
  const channels = state.frame?.channels || [];
  const rowHeight = 30;
  const cssHeight = Math.max(320, channels.length * rowHeight + 18);
  ui.traces.style.height = `${cssHeight}px`;
  const { ctx, width, height } = resizeCanvas(ui.traces, cssHeight);
  ctx.clearRect(0, 0, width, height);
  if (!channels.length) return;

  const labelWidth = 48;
  const plotLeft = labelWidth + 8;
  const plotWidth = width - plotLeft - 12;
  ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
  channels.forEach((channel, row) => {
    const centerY = 12 + row * rowHeight + rowHeight / 2;
    ctx.strokeStyle = "rgba(137,209,191,.055)";
    ctx.beginPath();
    ctx.moveTo(plotLeft, centerY);
    ctx.lineTo(width - 10, centerY);
    ctx.stroke();
    ctx.fillStyle = channel.quality < 0.5 ? "#f4c46c" : "rgba(184,211,204,.8)";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(channel.name, labelWidth, centerY);

    const trace = channel.trace_preview || [];
    if (trace.length < 2) return;
    ctx.beginPath();
    trace.forEach((value, index) => {
      const x = plotLeft + (index / (trace.length - 1)) * plotWidth;
      const y = centerY - Math.max(-1.5, Math.min(1.5, value)) * (rowHeight * 0.28);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = BAND_COLORS[channel.dominant_band] || "#78f2c2";
    ctx.globalAlpha = 0.25 + channel.quality * 0.7;
    ctx.lineWidth = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}

function updateFocusFromMouse() {
  let closest = null;
  let closestDistance = Infinity;
  for (const target of state.hitTargets) {
    const distance = Math.hypot(state.mouse.x - target.x, state.mouse.y - target.y);
    if (distance <= target.radius && distance < closestDistance) {
      closest = target.channel;
      closestDistance = distance;
    }
  }
  if (closest) setFocusedChannel(closest);
}

function setFocusedChannel(channel) {
  if (!channel || state.focused?.name === channel.name && state.focused?.frame === state.lastFrameId) return;
  state.focused = { ...channel, frame: state.lastFrameId };
  ui.focusName.textContent = `${channel.name} · ${channel.region}`;
  ui.focusFrequency.textContent = `${channel.dominant_frequency_hz.toFixed(2)} Hz / ${channel.dominant_band}`;
  ui.focusRms.textContent = `${channel.rms_amplitude.toFixed(2)} ${channel.voltage_unit}`;
  ui.focusRhythm.textContent = `${Math.round(channel.rhythmicity * 100)}%`;
  ui.focusQuality.textContent = `${Math.round(channel.quality * 100)}%`;
  ui.bandBars.innerHTML = "";
  for (const band of BAND_ORDER) {
    const value = channel.band_powers[band] || 0;
    const row = document.createElement("div");
    row.className = "band-bar";
    row.innerHTML = `<span>${band}</span><span class="bar-track"><span class="bar-fill" style="display:block;width:${value * 100}%;background:${BAND_COLORS[band]}"></span></span><span>${Math.round(value * 100)}%</span>`;
    ui.bandBars.appendChild(row);
  }
}

function render() {
  if (state.renderDirty) {
    drawConstellation();
    drawTraces();
    state.renderDirty = false;
  }
  requestAnimationFrame(render);
}

async function pollFrame() {
  if (state.staticDemo) return;
  try {
    const response = await fetch("/api/frame", { cache: "no-store" });
    if (!response.ok && response.status !== 503) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.frame) consumeFrame(payload.frame);
    state.requestFailures = 0;
    ui.connectionDot.className = "status-dot";
    ui.connectionText.textContent = payload.status === "complete" ? "Recording complete · final frame held" : "Local pipeline connected";
    if (payload.error) throw new Error(payload.error);
  } catch (error) {
    state.requestFailures += 1;
    if (state.requestFailures >= 4) startStaticDemo();
    else {
      ui.connectionDot.className = "status-dot waiting";
      ui.connectionText.textContent = "Waiting for local pipeline…";
    }
  }
}

function startStaticDemo() {
  state.staticDemo = true;
  ui.connectionDot.className = "status-dot waiting";
  ui.connectionText.textContent = "Static browser demo · no live source";
  let frameId = 0;
  const interpolate = (x, xs, ys) => {
    if (x <= xs[0]) return ys[0];
    for (let index = 1; index < xs.length; index += 1) {
      if (x <= xs[index]) {
        const fraction = (x - xs[index - 1]) / (xs[index] - xs[index - 1]);
        return ys[index - 1] + fraction * (ys[index] - ys[index - 1]);
      }
    }
    return ys[ys.length - 1];
  };
  const makeDemo = () => {
    if (!state.staticDemo) return;
    frameId += 1;
    const age = Number(ui.ageControl.value);
    const anchors = [1,3,8,15,18,40,65,80,100];
    const posteriorTarget = interpolate(age, anchors, [6,8,9,9.9,10,10,9.5,9,8.6]);
    const organization = interpolate(age, anchors, [.25,.45,.72,.96,1,1,.92,.82,.72]);
    const targetMap = {
      frontopolar: Math.min(18, posteriorTarget + 7 * organization),
      frontal: Math.min(18, posteriorTarget + 5.04 * organization),
      temporal: Math.max(5, posteriorTarget - organization),
      central: posteriorTarget + 1.5 * organization,
      parietal: posteriorTarget,
      "posterior-temporal": posteriorTarget - 0.5 * organization,
      occipital: posteriorTarget,
      unknown: posteriorTarget,
    };
    const names = ["Fp1","F7","F3","Fz","Fp2","F4","F8","T3","C3","Cz","C4","T4","T5","P3","Pz","P4","T6","O1","O2"];
    const regions = {
      Fp1:"frontopolar", Fp2:"frontopolar", F7:"frontal", F3:"frontal", Fz:"frontal", F4:"frontal", F8:"frontal",
      T3:"temporal", T4:"temporal", C3:"central", Cz:"central", C4:"central",
      T5:"posterior-temporal", T6:"posterior-temporal", P3:"parietal", Pz:"parietal", P4:"parietal", O1:"occipital", O2:"occipital",
    };
    const signalTargets = {frontopolar:17,frontal:15,temporal:9,central:11.5,"posterior-temporal":9.5,parietal:10.25,occipital:10};
    const now = frameId * 0.25;
    const channels = names.map((name, index) => {
      const region = regions[name];
      const posterior = /^(posterior-temporal|parietal|occipital)$/.test(region);
      const frequency = signalTargets[region] + Math.sin(now * 0.5 + index) * 0.3;
      const band = frequency < 13 ? "alpha" : "beta";
      return {
        name, region,
        hemisphere: /[1357]$/.test(name) ? "left" : /[2468]$/.test(name) ? "right" : "midline",
        angle_rad: Math.PI * 2 * index / names.length - Math.PI / 2,
        dominant_frequency_hz: frequency, spectral_centroid_hz: frequency + 2,
        band_powers: band === "alpha" ? {delta:.03,theta:.08,alpha:.74,beta:.13,gamma:.02} : {delta:.03,theta:.08,alpha:.18,beta:.67,gamma:.04},
        dominant_band: band, phase_rad: (now * frequency + index) % (Math.PI * 2), rhythmicity: .6,
        signed_voltage: Math.sin(now * frequency + index), rms_amplitude: posterior ? 24 : 10,
        peak_to_peak: posterior ? 68 : 30, voltage_unit: "uV", voltage_calibrated: true, quality: 1, quality_flags: [],
        trace_preview: Array.from({length:160}, (_, point) => Math.sin(point / 160 * Math.PI * 2 * frequency * 4 + index) * .75),
      };
    });
    consumeFrame({
      schema:"soniceeg.visual-frame/1", frame_id:frameId, source_kind:"static-demo", source_label:"Static Simulation 001 preview",
      timestamp_s:now, sample_rate_hz:256, window_seconds:4, patient_age_years:age,
      age_reference:{posterior_rhythm_reference_hz:posteriorTarget,organization_factor:organization,regional_frequency_targets_hz:targetMap},
      channels, candidates:{signal_integrity:[],physiology:[],normal_variants:[],abnormality:[]}, warnings:["Static UI demonstration only. Start the local Python pipeline for signal input."],
    });
    setTimeout(makeDemo, 250);
  };
  makeDemo();
}

ui.constellation.addEventListener("mousemove", (event) => {
  const rect = ui.constellation.getBoundingClientRect();
  state.mouse.x = event.clientX - rect.left;
  state.mouse.y = event.clientY - rect.top;
  state.renderDirty = true;
});
ui.constellation.addEventListener("mouseleave", () => { state.mouse = { x: -1000, y: -1000 }; state.renderDirty = true; });

ui.ageControl.addEventListener("input", () => {
  ui.ageOutput.value = `${ui.ageControl.value} y`;
  ui.ageOutput.textContent = ui.ageOutput.value;
  state.renderDirty = true;
});
ui.ageControl.addEventListener("change", async () => {
  if (state.staticDemo) return;
  try {
    await fetch("/api/age", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ age_years: Number(ui.ageControl.value) }),
    });
  } catch (_) { /* The next poll will expose connection state. */ }
});

ui.pauseButton.addEventListener("click", () => {
  state.paused = !state.paused;
  ui.pauseButton.textContent = state.paused ? "Resume" : "Pause";
  state.renderDirty = true;
});
ui.resetButton.addEventListener("click", () => {
  state.recent.clear();
  state.accumulated.length = 0;
  state.renderDirty = true;
});
for (const control of [ui.liveLayer, ui.recentLayer, ui.densityLayer, ui.referenceLayer]) {
  control.addEventListener("change", () => { state.renderDirty = true; });
}
window.addEventListener("resize", () => { state.renderDirty = true; });
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && event.target === document.body) {
    event.preventDefault();
    ui.pauseButton.click();
  }
});

setInterval(pollFrame, 250);
pollFrame();
requestAnimationFrame(render);

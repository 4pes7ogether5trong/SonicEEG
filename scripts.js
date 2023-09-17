let audioCtx;
let oscillator;
let gainNode;

const startButton = document.getElementById('startMonitoring');
const eegBar = document.getElementById('eegBar');
const refreshBar = document.getElementById('refreshBar');
const roiBox = document.getElementById('roiBox');
const baseFrequencyInput = document.getElementById('baseFrequency');
const applySettingsButton = document.getElementById('applySettings');
let barPosition = 0;

let baseFrequency = 300; // This is a default value and can be adjusted

document.getElementById("startSound").addEventListener("click", () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        oscillator = audioCtx.createOscillator();
        gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(baseFrequency, audioCtx.currentTime);
        oscillator.start();
    } else if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
});

document.getElementById("stopSound").addEventListener("click", () => {
    if (audioCtx && audioCtx.state !== 'suspended') {
        audioCtx.suspend();
    }
});

startButton.addEventListener('click', () => {
    gainNode.gain.setValueAtTime(1, audioCtx.currentTime); // Unmute sound
    setInterval(moveRefreshBar, 100); // Moves the bar every 100ms
});

applySettingsButton.addEventListener('click', () => {
    const newBaseFrequency = parseInt(baseFrequencyInput.value);
    oscillator.frequency.setValueAtTime(newBaseFrequency, audioCtx.currentTime);
});

function moveRefreshBar() {
    barPosition += 2;

    if (barPosition >= 100) {
        barPosition = 0;
    }

    refreshBar.style.left = `${barPosition}%`;
    const roiPosition = barPosition - 10;  
    roiBox.style.left = `${roiPosition > 0 ? roiPosition : 0}%`;

    const amplitude = (Math.sin(barPosition / 10) + 1) / 2;
    gainNode.gain.setValueAtTime(amplitude, audioCtx.currentTime);

    const derivative = Math.cos(barPosition / 10);
    const pitchFactor = 1 + derivative; 
    oscillator.frequency.setValueAtTime(440 * pitchFactor, audioCtx.currentTime);
}


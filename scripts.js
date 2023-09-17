const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const oscillator = audioCtx.createOscillator();
const gainNode = audioCtx.createGain();

oscillator.connect(gainNode);
gainNode.connect(audioCtx.destination);

oscillator.type = 'sine';
oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
oscillator.start();

let interval;

const startButton = document.getElementById('startMonitoring');
const stopButton = document.getElementById('stopMonitoring');
const refreshBar = document.getElementById('refreshBar');
const roiBox = document.getElementById('roiBox');
let barPosition = 0;

startButton.addEventListener('click', () => {
    gainNode.gain.setValueAtTime(1, audioCtx.currentTime); // Unmute sound
    interval = setInterval(moveRefreshBar, 100); // Moves the bar every 100ms
});

stopButton.addEventListener('click', () => {
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime); // Mute sound
    clearInterval(interval);
});

function moveRefreshBar() {
    barPosition += 2;  // Moves 2% of the display width in each call

    if (barPosition >= 100) { // Resets after crossing the display
        barPosition = 0;
    }

    refreshBar.style.left = `${barPosition}%`;

    // Make ROI Box follow the refresh bar
    const roiPosition = barPosition - 10;  // Offset to have the ROI "chase" the bar
    roiBox.style.left = `${roiPosition > 0 ? roiPosition : 0}%`; 

    // Mock amplitude, returns value between 0 and 1
    const amplitude = (Math.sin(barPosition / 10) + 1) / 2; 
    gainNode.gain.setValueAtTime(amplitude, audioCtx.currentTime);

    // Change the pitch based on the frequency of the sine rhythm
    const derivative = Math.cos(barPosition / 10);
    const pitchFactor = 1 + derivative; 
    oscillator.frequency.setValueAtTime(440 * pitchFactor, audioCtx.currentTime); 
}

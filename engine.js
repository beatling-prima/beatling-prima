// engine.js - Beatling Prima

let isRecording = false;
let isPlayingBack = false;
let recordedFrames = [];
let recordings = [];
let recStartTime = 0;
let recTimerInterval = null;
let lastPinchState = 0;
let playbackIndex = 0;

async function startCamera() {
  Audio.init();
  await Capture.init(onStateVector);
}

function onStateVector(state) {
  if (isPlayingBack) return;

  const scale = document.getElementById('scale-select')?.value || 'pentatonic_major';
  const key = document.getElementById('key-select')?.value || 'C';
  const instrument = document.getElementById('instrument-select')?.value || 'marimba';

  const hasRightHand = state.rightHand !== null;

  if (hasRightHand) {
    const velocity = state.D3 > 0.05 ? state.D3 : 0.6;
    Audio.noteOn(state.D1, velocity, state.D10, scale, key, instrument);
  } else {
    Audio.noteOff();
  }

  lastPinchState = state.D7;

  if (isRecording) {
    recordedFrames.push({
      t: Date.now() - recStartTime,
      v: [state.D1, state.D2, state.D3, 0, 0, 0, state.D7, 0, state.D9, state.D10, 0, 0, 0],
      scale, key, instrument
    });
  }
}

function toggleRecord() {
  if (isPlayingBack) return;
  if (!isRecording) { startRecording(); } else { stopRecording(); }
}

function startRecording() {
  isRecording = true;
  recordedFrames = [];
  recStartTime = Date.now();
  const btn = document.getElementById('rec-btn');
  const label = document.getElementById('rec-label');
  const timer = document.getElementById('rec-timer');
  if (btn) btn.classList.add('recording');
  if (label) label.textContent = 'STOP';
  if (timer) timer.classList.add('active');
  recTimerInterval = setInterval(() => {
    const elapsed = Date.now() - recStartTime;
    const mm = String(Math.floor(elapsed / 60000)).padStart(2, '0');
    const ss = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
    if (timer) timer.textContent = `● ${mm}:${ss}`;
  }, 500);
}

function stopRecording() {
  isRecording = false;
  clearInterval(recTimerInterval);
  const btn = document.getElementById('rec-btn');
  const label = document.getElementById('rec-label');
  const timer = document.getElementById('rec-timer');
  if (btn) btn.classList.remove('recording');
  if (label) label.textContent = 'REC';
  if (timer) timer.classList.remove('active');
  if (recordedFrames.length > 0) saveRecording([...recordedFrames]);
}

function saveRecording(frames) {
  if (recordings.length >= 3) {
    alert('Free版は最大3件まで。Prima+にアップグレードすると無制限に保存できます。');
    return;
  }
  const duration = frames[frames.length - 1].t;
  const mm = String(Math.floor(duration / 60000)).padStart(2, '0');
  const ss = String(Math.floor((duration % 60000) / 1000)).padStart(2, '0');
  const rec = {
    id: Date.now(),
    name: `Take ${recordings.length + 1}`,
    duration: `${mm}:${ss}`,
    frames
  };
  recordings.push(rec);
  renderRecList();
}

function renderRecList() {
  const list = document.getElementById('rec-list');
  if (!list) return;
  list.innerHTML = recordings.map(rec => `
    <div class="rec-item">
      <div>
        <div class="rec-item-name">${rec.name}</div>
        <div style="font-size:10px;color:var(--text-dim)">${rec.duration}</div>
      </div>
      <button class="rec-item-btn" onclick="playback(${rec.id})">▶ PLAY</button>
    </div>
  `).join('');
}

function playback(id) {
  if (isRecording || isPlayingBack) return;
  const rec = recordings.find(r => r.id === id);
  if (!rec || rec.frames.length === 0) return;
  isPlayingBack = true;
  playbackIndex = 0;
  const frames = rec.frames;
  const startTime = Date.now();
  function playFrame() {
    if (playbackIndex >= frames.length) {
      isPlayingBack = false;
      Audio.noteOff();
      return;
    }
    const frame = frames[playbackIndex];
    if (Date.now() - startTime >= frame.t) {
      const [D1,,D3,,,,,,,D10] = frame.v;
      Audio.noteOn(D1, D3 > 0.05 ? D3 : 0.6, D10, frame.scale, frame.key, frame.instrument);
      playbackIndex++;
    }
    requestAnimationFrame(playFrame);
  }
  requestAnimationFrame(playFrame);
}

function showUpgrade() {
  alert('Prima+\n\n・録音の無制限保存\n・MIDIファイル書き出し\n・WAV/MP3書き出し\n\n$9.99/月 または $79/年\n\nまもなく公開します！');
}

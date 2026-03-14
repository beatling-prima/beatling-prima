// engine.js - Beatling Prima
// メインループ・録音・再生エンジン

// グローバル状態
let isRecording = false;
let isPlayingBack = false;
let recordedFrames = [];
let recordings = [];
let recStartTime = 0;
let recTimerInterval = null;
let lastPinchState = 0;
let playbackIndex = 0;

// カメラ起動
async function startCamera() {
  Audio.init();
  await Capture.init(onStateVector);
}

// 状態ベクトル受信（毎フレーム呼ばれる）
function onStateVector(state) {
  if (isPlayingBack) return;

  const scale = document.getElementById('scale-select')?.value || 'pentatonic_major';
  const key = document.getElementById('key-select')?.value || 'C';
  const instrument = document.getElementById('instrument-select')?.value || 'marimba';

  // ピンチでノートON/OFF（エッジ検出）
  const isPinching = state.D7 === 1;
  const wasPinching = lastPinchState === 1;

  if (isPinching && !wasPinching) {
    // ピンチ開始 → ノートON
    Audio.noteOn(state.D1, state.D3, state.D10, scale, key, instrument);
  } else if (!isPinching && wasPinching) {
    // ピンチ解除 → ノートOFF
    Audio.noteOff();
  } else if (isPinching) {
    // ピンチ継続中 → ピッチ・音量をリアルタイム更新
    Audio.noteOn(state.D1, state.D3, state.D10, scale, key, instrument);
  }

  lastPinchState = state.D7;

  // 録音中はフレームを記録
  if (isRecording) {
    recordedFrames.push({
      t: Date.now() - recStartTime,
      v: [state.D1, state.D2, state.D3, 0, 0, 0, state.D7, 0, state.D9, state.D10, 0, 0, 0],
      scale, key, instrument
    });
  }
}

// 録音トグル
function toggleRecord() {
  if (isPlayingBack) return;

  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
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

  // タイマー表示
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

  if (recordedFrames.length > 0) {
    saveRecording([...recordedFrames]);
  }
}

// 録音を保存（Free版はメモリのみ・最大3件）
function saveRecording(frames) {
  const MAX_FREE = 3;

  if (recordings.length >= MAX_FREE) {
    alert(`Free版は最大${MAX_FREE}件まで保存できます。\nPrima+にアップグレードすると無制限に保存・書き出しが可能です。`);
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

// 録音リストのレンダリング
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

// 再生
function playback(id) {
  if (isRecording || isPlayingBack) return;

  const rec = recordings.find(r => r.id === id);
  if (!rec || rec.frames.length === 0) return;

  isPlayingBack = true;
  playbackIndex = 0;

  const frames = rec.frames;
  const startTime = Date.now();
  let lastPinch = 0;

  function playFrame() {
    if (playbackIndex >= frames.length) {
      isPlayingBack = false;
      Audio.noteOff();
      return;
    }

    const frame = frames[playbackIndex];
    const elapsed = Date.now() - startTime;

    // タイムスタンプに追いついたら再生
    if (elapsed >= frame.t) {
      const [D1, , D3, , , , D7, , , D10] = frame.v;
      const scale = frame.scale;
      const key = frame.key;
      const instrument = frame.instrument;

      const isPinching = D7 === 1;
      if (isPinching && lastPinch === 0) {
        Audio.noteOn(D1, D3, D10, scale, key, instrument);
      } else if (!isPinching && lastPinch === 1) {
        Audio.noteOff();
      } else if (isPinching) {
        Audio.noteOn(D1, D3, D10, scale, key, instrument);
      }
      lastPinch = D7;
      playbackIndex++;
    }

    requestAnimationFrame(playFrame);
  }

  requestAnimationFrame(playFrame);
}

// Prima+アップグレード表示
function showUpgrade() {
  alert('Prima+\n\n・録音の無制限保存\n・MIDIファイル書き出し\n・WAV/MP3書き出し\n・クラウド保存\n・全音源パック\n\n$9.99/月 または $79/年\n\n準備中です。まもなく公開します！');
}

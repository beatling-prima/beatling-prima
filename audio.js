// audio.js - Beatling Prima
// Web Audio APIによる音声生成エンジン

const Audio = (() => {
  let ctx = null;
  let currentOscillator = null;
  let currentGain = null;
  let filterNode = null;
  let reverbNode = null;
  let isPlaying = false;

  // スケール定義（半音インデックス）
  const SCALES = {
    pentatonic_major: [0, 2, 4, 7, 9],
    pentatonic_minor: [0, 3, 5, 7, 10],
    major:            [0, 2, 4, 5, 7, 9, 11],
    minor:            [0, 2, 3, 5, 7, 8, 10],
    blues:            [0, 3, 5, 6, 7, 10]
  };

  // キーの基準周波数（MIDI note 60 = C4 = 261.63Hz）
  const KEY_OFFSETS = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11
  };

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // MIDIノート番号から周波数
  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // D1（0〜1）をスケール上のMIDIノートに変換
  function d1ToMidi(d1, scaleName, keyName) {
    const scale = SCALES[scaleName] || SCALES.pentatonic_major;
    const keyOffset = KEY_OFFSETS[keyName] || 0;
    const safeD1 = isNaN(d1) || d1 === null ? 0.5 : Math.max(0, Math.min(1, d1));
    const totalSteps = scale.length * 2;
    const step = Math.floor(safeD1 * totalSteps);
    const clampedStep = Math.min(step, totalSteps - 1);
    const octave = Math.floor(clampedStep / scale.length);
    const scaleIndex = clampedStep % scale.length;
    const semitone = scale[scaleIndex] + keyOffset;
    const midi = 48 + octave * 12 + semitone;
    return Math.min(84, Math.max(36, midi));
  }
  // 音色別エンベロープ設定
  const INSTRUMENTS = {
    marimba: { attack: 0.005, decay: 0.3, sustain: 0.1, release: 0.5, type: 'sine', harmonics: [1, 0.5, 0.25] },
    sine:    { attack: 0.01,  decay: 0.1, sustain: 0.7, release: 0.3, type: 'sine', harmonics: [1] },
    bell:    { attack: 0.001, decay: 0.8, sustain: 0.05, release: 1.0, type: 'sine', harmonics: [1, 0.4, 0.2, 0.1] },
    pluck:   { attack: 0.001, decay: 0.15, sustain: 0.0, release: 0.2, type: 'sawtooth', harmonics: [1, 0.3] }
  };

  // AudioContext初期化
  function init() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();

      // フィルターノード
      filterNode = ctx.createBiquadFilter();
      filterNode.type = 'lowpass';
      filterNode.frequency.value = 8000;
      filterNode.Q.value = 1.0;

      // リバーブ（シンプルなコンボルバー代替: ディレイ）
      reverbNode = ctx.createDelay(0.5);
      reverbNode.delayTime.value = 0.15;
      const reverbGain = ctx.createGain();
      reverbGain.gain.value = 0.2;
      reverbNode.connect(reverbGain);
      reverbGain.connect(ctx.destination);

      filterNode.connect(ctx.destination);
      filterNode.connect(reverbNode);
    }
    return ctx;
  }

  // ノートON
  function noteOn(d1, d3, d10, scaleName, keyName, instrumentName) {
    if (!ctx) init();
    if (ctx.state === 'suspended') ctx.resume();

    // 前のノートを停止
    noteOff();

    const midi = d1ToMidi(d1, scaleName, keyName);
    const freq = midiToFreq(midi);
    const velocity = Math.max(0.1, d3);
    const instrument = INSTRUMENTS[instrumentName] || INSTRUMENTS.marimba;

    // ノート名を表示
    const noteName = NOTE_NAMES[midi % 12] + Math.floor(midi / 12 - 1);
    showNote(noteName);

    // 複数オシレーターでハーモニクス生成
    const masterGain = ctx.createGain();
    masterGain.connect(filterNode);

    const now = ctx.currentTime;
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(velocity * 0.5, now + instrument.attack);
    masterGain.gain.linearRampToValueAtTime(velocity * instrument.sustain, now + instrument.attack + instrument.decay);

    // フィルターをD10（開き度）で変調
    filterNode.frequency.setValueAtTime(500 + d10 * 7500, now);

    instrument.harmonics.forEach((amp, i) => {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = i === 0 ? instrument.type : 'sine';
      osc.frequency.setValueAtTime(freq * (i + 1), now);
      oscGain.gain.value = amp;
      osc.connect(oscGain);
      oscGain.connect(masterGain);
      osc.start(now);
    });

    currentGain = masterGain;
    isPlaying = true;

    // カメラドットをplayingに
    const dot = document.getElementById('cam-dot');
    if (dot) {
      dot.classList.remove('active');
      dot.classList.add('playing');
    }

    return { midi, freq, noteName };
  }

  // ノートOFF
  function noteOff() {
    if (!currentGain || !isPlaying) return;
    const now = ctx.currentTime;
    const instrument = INSTRUMENTS[document.getElementById('instrument-select')?.value || 'marimba'];
    currentGain.gain.cancelScheduledValues(now);
    currentGain.gain.setValueAtTime(currentGain.gain.value, now);
    currentGain.gain.exponentialRampToValueAtTime(0.001, now + (instrument?.release || 0.5));
    isPlaying = false;

    const dot = document.getElementById('cam-dot');
    if (dot) {
      dot.classList.remove('playing');
      dot.classList.add('active');
    }

    hideNote();
  }

  // ノート名表示
  function showNote(name) {
    const el = document.getElementById('note-display');
    if (el) {
      el.textContent = name;
      el.classList.add('visible');
    }
  }

  function hideNote() {
    const el = document.getElementById('note-display');
    if (el) el.classList.remove('visible');
  }

  return { init, noteOn, noteOff, isPlaying: () => isPlaying };
})();

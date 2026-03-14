// capture.js - Beatling Prima
// MediaPipeによる状態ベクトル取得モジュール

const Capture = (() => {
  let hands = null;
  let camera = null;
  let onVectorCallback = null;

  // 状態ベクトル（6次元 MVP版）
  const state = {
    D1: 0,   // 右手高さ      0.0〜1.0
    D2: 0,   // 右手左右      0.0〜1.0
    D3: 0,   // 右手奥行き    0.0〜1.0
    D7: 0,   // 右手ジェスチャー 0=open, 1=pinch, 2=fist
    D9: 0,   // 両手間距離    0.0〜1.0
    D10: 0,  // 右手開き度    0.0〜1.0
    rightHand: null,
    leftHand: null,
    timestamp: 0
  };

  // ピンチ検出（親指先端と人差し指先端の距離）
  function detectPinch(landmarks) {
    const thumb = landmarks[4];
    const index = landmarks[8];
    const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
    return dist < 0.06 ? 1 : 0;
  }

  // 拳検出（指の折り曲がり具合）
  function detectFist(landmarks) {
    // 指先とMCPの距離が小さければ拳
    const tips = [8, 12, 16, 20];
    const mcps = [5, 9, 13, 17];
    let folded = 0;
    for (let i = 0; i < tips.length; i++) {
      const tip = landmarks[tips[i]];
      const mcp = landmarks[mcps[i]];
      const dist = Math.hypot(tip.x - mcp.x, tip.y - mcp.y);
      if (dist < 0.1) folded++;
    }
    return folded >= 3 ? 2 : 0;
  }

  // 手の開き度（指間の平均距離）
  function calcSpread(landmarks) {
    const tips = [4, 8, 12, 16, 20];
    let totalDist = 0;
    let count = 0;
    for (let i = 0; i < tips.length - 1; i++) {
      const a = landmarks[tips[i]];
      const b = landmarks[tips[i + 1]];
      totalDist += Math.hypot(a.x - b.x, a.y - b.y);
      count++;
    }
    return Math.min(1.0, (totalDist / count) / 0.15);
  }

  // MediaPipe結果処理
  function onResults(results) {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 状態をリセット
    state.rightHand = null;
    state.leftHand = null;

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i].label;

        // MediaPipeのlabel: "Left"/"Right" はミラー反転なので逆にする
        const isRight = handedness === 'Left';

        // ランドマーク描画
        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
          color: isRight ? 'rgba(124,106,255,0.6)' : 'rgba(255,106,154,0.6)',
          lineWidth: 2
        });
        drawLandmarks(ctx, landmarks, {
          color: isRight ? '#7c6aff' : '#ff6a9a',
          lineWidth: 1,
          radius: 3
        });

        // 正規化座標をキャンバス座標に変換して保存
        const wrist = landmarks[0];

        if (isRight) {
          state.rightHand = landmarks;
          state.D1 = 1.0 - wrist.y;         // 高さ（上が1.0）
          state.D2 = 1.0 - wrist.x;         // 左右（右が1.0、ミラー補正）
          state.D3 = Math.min(1.0, Math.max(0.0, (wrist.z + 0.3) / 0.6 * -1 + 0.5)); // 奥行き

          // ジェスチャー
          const pinch = detectPinch(landmarks);
          const fist = detectFist(landmarks);
          state.D7 = pinch > 0 ? 1 : fist > 0 ? 2 : 0;

          // 開き度
          state.D10 = calcSpread(landmarks);
        } else {
          state.leftHand = landmarks;
        }
      }

      // 両手間距離
      if (state.rightHand && state.leftHand) {
        const rw = state.rightHand[0];
        const lw = state.leftHand[0];
        state.D9 = Math.min(1.0, Math.hypot(rw.x - lw.x, rw.y - lw.y) / 0.8);
      } else {
        state.D9 = 0;
      }
    }

    state.timestamp = Date.now();

    // コールバックで状態ベクトルを送出
    if (onVectorCallback) {
      onVectorCallback({ ...state });
    }

    // UIの状態バー更新
    updateVectorUI(state);
  }

  // ベクトルUIの更新
  function updateVectorUI(s) {
    const bars = {
      'd1': s.D1, 'd2': s.D2, 'd3': s.D3,
      'd7': s.D7 / 2, 'd9': s.D9, 'd10': s.D10
    };
    for (const [key, val] of Object.entries(bars)) {
      const bar = document.getElementById(`bar-${key}`);
      const valEl = document.getElementById(`val-${key}`);
      if (bar) bar.style.width = `${(val * 100).toFixed(0)}%`;
      if (valEl) valEl.textContent = val.toFixed(2);
    }

    // ピッチライン
    const pitchLine = document.getElementById('pitch-line');
    if (pitchLine && s.rightHand) {
      pitchLine.style.top = `${(1 - s.D1) * 100}%`;
    }

    // ジェスチャーバッジ
    const badge = document.getElementById('gesture-badge');
    if (badge) {
      if (s.D7 === 1) {
        badge.textContent = '🤏 PINCH';
        badge.classList.add('visible');
      } else if (s.D7 === 2) {
        badge.textContent = '✊ FIST';
        badge.classList.add('visible');
      } else {
        badge.classList.remove('visible');
      }
    }

    // オーバーレイ情報
    const info = document.getElementById('overlay-info');
    if (info) {
      const rHand = s.rightHand ? '✓ RIGHT' : '· RIGHT';
      const lHand = s.leftHand ? '✓ LEFT' : '· LEFT';
      info.textContent = `${rHand}  ${lHand}`;
    }
  }

  // カメラ初期化
  async function init(callback) {
    onVectorCallback = callback;

    const video = document.getElementById('video');

    hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5
    });

    hands.onResults(onResults);

    camera = new Camera(video, {
      onFrame: async () => {
        await hands.send({ image: video });
      },
      width: 1280,
      height: 720
    });

    await camera.start();

    // ステータス更新
    document.getElementById('cam-dot').classList.add('active');
    document.getElementById('status-text').textContent = 'CAMERA ON';

    // スタート画面を非表示
    const startScreen = document.getElementById('start-screen');
    if (startScreen) {
      startScreen.style.transition = 'opacity 0.5s';
      startScreen.style.opacity = '0';
      setTimeout(() => startScreen.style.display = 'none', 500);
    }
  }

  return { init };
})();

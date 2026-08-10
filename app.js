const $ = (selector) => document.querySelector(selector);

const els = {
  stage: $('#stage'), intro: $('#introCopy'), mobile: $('#mobileScene'), desktop: $('#desktopScene'),
  device: $('#deviceLabel'), polaroid: $('#polaroidButton'), camera: $('#cameraOverlay'), video: $('#cameraVideo'),
  cameraMessage: $('#cameraMessage'), preview: $('#previewPanel'), previewImage: $('#previewImage'), photoMeta: $('#photoMeta'),
  printing: $('#printingScene'), typewriter: $('#printingScene .typewriter-model'), keyboard: $('#modelKeyboard'), carriage: $('#typewriterCarriage'),
  printingStatus: $('#printingStatus'), printingActions: $('#printingActions'), typedReceipt: $('#typedReceipt'), receiptPhoto: $('#receiptPhoto'),
  file: $('#fileInput'), capture: $('#captureCanvas'), export: $('#exportCanvas'), drop: $('#dropZone'), toast: $('#toast')
};

const quotes = [
  '今天也有值得被记住的小事。',
  '日子普通，镜头替你认真收藏。',
  '这一刻没有重来，所以格外可爱。',
  '慢一点，生活正在递给你答案。',
  '把今日份的微光，放进口袋里。',
  '你经过的地方，都留下了温度。',
  '平凡的一天，也有自己的纪念日。',
  '愿你喜欢今天，也期待明天。'
];

const state = {
  isMobile: false, imageUrl: '', stream: null, facingMode: 'environment', sound: true,
  quoteIndex: Math.floor(Math.random() * quotes.length), location: '此刻所在的地方', weather: '天气未记录',
  date: new Date(), objectUrl: null
};

const keyRows = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
document.querySelectorAll('.model-keyboard').forEach(keyboard => {
  keyRows.forEach((row, rowIndex) => {
    const keyRow = document.createElement('div');
    keyRow.className = `model-key-row row-${rowIndex + 1}`;
    [...row].forEach(letter => {
      const key = document.createElement('span');
      key.className = 'model-key';
      key.textContent = letter;
      keyRow.appendChild(key);
    });
    keyboard.appendChild(keyRow);
  });
});

function detectDevice() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const narrow = matchMedia('(max-width: 767px)').matches;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  state.isMobile = narrow || (coarse && mobileUA);
  els.device.textContent = state.isMobile ? '手机模式' : '电脑模式';
  els.mobile.hidden = !state.isMobile;
  els.desktop.hidden = state.isMobile;
}

function showOnly(name) {
  const sections = { mobile: els.mobile, desktop: els.desktop, preview: els.preview, printing: els.printing };
  Object.entries(sections).forEach(([key, element]) => { element.hidden = key !== name; });
  els.intro.hidden = !['mobile', 'desktop'].includes(name);
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { els.toast.hidden = true; }, 2800);
}

function playClick(frequency = 220, duration = .06) {
  if (!state.sound) return;
  try {
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    const context = playClick.context || (playClick.context = new AudioEngine());
    if (context.state === 'suspended') context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + duration);
  } catch (_) { /* sound is optional */ }
}

async function openCamera() {
  els.polaroid.classList.add('flipped'); playClick(160, .14);
  await new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650));
  els.camera.hidden = false;
  els.cameraMessage.hidden = true;
  if (!navigator.mediaDevices?.getUserMedia) {
    showCameraError('当前浏览器不能直接调用相机，请从相册选择照片。'); return;
  }
  try {
    stopCamera();
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: state.facingMode }, width: { ideal: 1440 }, height: { ideal: 1920 } }, audio: false });
    els.video.srcObject = state.stream;
  } catch (_) {
    showCameraError('无法打开相机。请允许相机权限，或从相册选择照片。');
  }
}

function showCameraError(message) { els.cameraMessage.textContent = message; els.cameraMessage.hidden = false; }
function stopCamera() { state.stream?.getTracks().forEach(track => track.stop()); state.stream = null; els.video.srcObject = null; }
function closeCamera() { stopCamera(); els.camera.hidden = true; els.polaroid.classList.remove('flipped'); }

function capturePhoto() {
  if (!els.video.videoWidth) { toast('相机还在准备，请稍等一下'); return; }
  const canvas = els.capture;
  canvas.width = els.video.videoWidth; canvas.height = els.video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (state.facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(els.video, 0, 0);
  playClick(95, .18);
  setPhoto(canvas.toDataURL('image/jpeg', .9));
  closeCamera();
}

function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) { toast('请选择一张图片文件'); return; }
  if (file.size > 18 * 1024 * 1024) { toast('照片有点大，请选择 18MB 以内的图片'); return; }
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => setPhoto(state.objectUrl, `${image.naturalWidth} × ${image.naturalHeight}`);
  image.onerror = () => toast('暂时无法读取这张照片，请换一张试试');
  image.src = state.objectUrl;
}

function setPhoto(url, dimensions = '现场拍摄') {
  state.imageUrl = url; state.date = new Date();
  els.previewImage.src = url; els.receiptPhoto.src = url;
  els.photoMeta.textContent = `${dimensions}，照片只在你的浏览器中处理。`;
  showOnly('preview');
}

async function getContextInfo() {
  state.location = '此刻所在的地方'; state.weather = '天气未记录';
  if (!navigator.geolocation) return;
  try {
    const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6500, maximumAge: 300000 }));
    const { latitude, longitude } = position.coords;
    const [placeResult, weatherResult] = await Promise.allSettled([
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=13&accept-language=zh-CN`).then(r => r.ok ? r.json() : Promise.reject()),
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`).then(r => r.ok ? r.json() : Promise.reject())
    ]);
    if (placeResult.status === 'fulfilled') {
      const a = placeResult.value.address || {};
      state.location = a.city || a.town || a.county || a.state || '此刻所在的地方';
    }
    if (weatherResult.status === 'fulfilled') {
      const current = weatherResult.value.current;
      state.weather = `${weatherName(current.weather_code)} ${Math.round(current.temperature_2m)}°C`;
    }
  } catch (_) { /* privacy-friendly fallback */ }
}

function weatherName(code) {
  if (code === 0) return '晴'; if ([1, 2].includes(code)) return '晴间多云'; if (code === 3) return '多云';
  if ([45, 48].includes(code)) return '有雾'; if (code >= 51 && code <= 67) return '有雨';
  if (code >= 71 && code <= 77) return '有雪'; if (code >= 80 && code <= 82) return '阵雨';
  if (code >= 95) return '雷雨'; return '天气未记录';
}

async function makeReceipt() {
  showOnly('printing'); playClick(120, .12);
  els.printing.classList.remove('is-complete');
  els.printingActions.hidden = true;
  els.typedReceipt.classList.remove('is-printing', 'is-printed');
  els.printingStatus.textContent = '正在读取今天的信息';
  await getContextInfo();
  fillReceipt();
  void els.typedReceipt.offsetWidth;
  els.typedReceipt.classList.add('is-printing');
  els.typewriter.classList.add('is-typing');
  const keys = [...els.keyboard.querySelectorAll('.model-key'), $('#modelSpacebar')];
  let carriageStep = 0;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let activeKey = null;
  const keyTimer = setInterval(() => {
    activeKey?.classList.remove('pressed');
    const key = keys[Math.floor(Math.random() * keys.length)];
    key.classList.remove('pressed');
    void key.offsetWidth;
    key.classList.add('pressed');
    activeKey = key;
    setTimeout(() => {
      key.classList.remove('pressed');
      if (activeKey === key) activeKey = null;
    }, reduceMotion ? 220 : 165);
    carriageStep = (carriageStep + 1) % 13;
    if (!reduceMotion) els.carriage.style.setProperty('--carriage-x', `${(carriageStep - 6) * .9}%`);
    playClick(155 + Math.random() * 95, .035);
  }, reduceMotion ? 440 : 120);
  const messages = ['正在读取今天的时间', '正在看看窗外的天气', '正在挑选今天的一句话', '正在排版你的照片'];
  let index = 0; els.printingStatus.textContent = messages[0];
  const timer = setInterval(() => { index = Math.min(index + 1, messages.length - 1); els.printingStatus.textContent = messages[index]; playClick(180 + index * 35); }, 700);
  await new Promise(resolve => setTimeout(resolve, 2850));
  clearInterval(timer); clearInterval(keyTimer); activeKey?.classList.remove('pressed'); els.typewriter.classList.remove('is-typing');
  els.carriage.style.removeProperty('--carriage-x'); els.typedReceipt.classList.remove('is-printing'); els.typedReceipt.classList.add('is-printed');
  els.printing.classList.add('is-complete'); els.printingActions.hidden = false; els.printingStatus.textContent = '打印完成'; playClick(440, .18);
}

function fillReceipt() {
  const d = state.date;
  $('#receiptDate').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  $('#receiptTime').textContent = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  $('#receiptPlace').textContent = state.location; $('#receiptWeather').textContent = state.weather;
  $('#receiptQuote').textContent = `“${quotes[state.quoteIndex]}”`;
  $('#receiptNumber').textContent = `NO. ${String(d.getMonth() + 1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}

function changeQuote() { state.quoteIndex = (state.quoteIndex + 1) % quotes.length; fillReceipt(); playClick(330); }

function drawCover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sw = width / scale, sh = height / scale;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, width, height);
}

async function downloadReceipt() {
  const canvas = els.export, ctx = canvas.getContext('2d'); canvas.width = 1200; canvas.height = 1400;
  const rose = '#c95e73', pale = '#fff8f5', paper = '#fffdf8', blue = '#cfecef';
  const rounded = (x, y, width, height, radius) => {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y); ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r); ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  };
  const line = (x1, y1, x2, y2, width = 3) => { ctx.lineWidth = width; ctx.strokeStyle = rose; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  const fitText = (text, x, y, maxWidth, lineHeight, maxLines = 2) => {
    const chars = [...text]; let row = '', rows = [];
    chars.forEach(char => { const test = row + char; if (ctx.measureText(test).width > maxWidth && row) { rows.push(row); row = char; } else row = test; });
    if (row) rows.push(row); rows.slice(0, maxLines).forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
  };
  ctx.fillStyle = blue; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(201,94,115,.12)'; ctx.lineWidth = 2;
  for (let x = 0; x < canvas.width; x += 52) line(x, 0, x, canvas.height, 1);
  for (let y = 0; y < canvas.height; y += 52) line(0, y, canvas.width, y, 1);

  ctx.save(); ctx.shadowColor = 'rgba(201,94,115,.14)'; ctx.shadowOffsetX = 10; ctx.shadowOffsetY = 12;
  ctx.fillStyle = paper; rounded(300, 55, 600, 800, 8); ctx.fill(); ctx.restore();
  ctx.strokeStyle = rose; ctx.lineWidth = 3; rounded(300, 55, 600, 800, 8); ctx.stroke();
  ctx.fillStyle = '#a53f55'; ctx.textBaseline = 'top'; ctx.font = 'bold 28px monospace'; ctx.fillText("TODAY'S RECEIPT", 340, 92);
  ctx.textAlign = 'right'; ctx.font = '16px monospace'; ctx.fillText($('#receiptNumber').textContent, 860, 100); ctx.textAlign = 'left';
  ctx.setLineDash([10, 8]); line(340, 143, 860, 143, 2); ctx.setLineDash([]);
  const image = new Image(); image.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = state.imageUrl; });
  ctx.save(); ctx.translate(600, 320); ctx.rotate(-.018); ctx.fillStyle = '#f7dfe3'; ctx.fillRect(-215, -142, 430, 284); drawCover(ctx, image, -202, -129, 404, 258); ctx.restore();
  const rows = [['日期', $('#receiptDate').textContent], ['时间', $('#receiptTime').textContent], ['地点', state.location], ['天气', state.weather]];
  ctx.setLineDash([8, 7]); line(340, 480, 860, 480, 2); ctx.setLineDash([]);
  rows.forEach((row, i) => { const y = 510 + i * 43; ctx.fillStyle = '#c95e73'; ctx.font = '18px sans-serif'; ctx.fillText(row[0], 350, y); ctx.fillStyle = '#82384a'; ctx.textAlign = 'right'; ctx.fillText(row[1], 850, y); ctx.textAlign = 'left'; });
  ctx.setLineDash([8, 7]); line(340, 695, 860, 695, 2); ctx.setLineDash([]);
  ctx.fillStyle = '#82384a'; ctx.textAlign = 'center'; ctx.font = '20px sans-serif'; fitText(`“${quotes[state.quoteIndex]}”`, 600, 720, 470, 30, 2);
  ctx.font = 'bold 14px monospace'; ctx.fillText('THANK YOU FOR TODAY', 600, 792); ctx.textAlign = 'left';

  ctx.fillStyle = pale; ctx.strokeStyle = rose; ctx.lineWidth = 4; rounded(135, 790, 930, 480, 55); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff1f1'; ctx.strokeStyle = rose; rounded(205, 815, 790, 130, 22); ctx.fill(); ctx.stroke();
  ctx.fillStyle = paper; ctx.strokeStyle = rose; rounded(230, 865, 740, 300, 18); ctx.fill(); ctx.stroke();
  const labels = ['1','2','3','4','5','6','7','8','9','0','Q','W','E','R','T','Y','U','I','O','P','A','S','D','F','G','H','J','K','L','Z','X','C','V','B','N','M'];
  const counts = [10, 10, 9, 7]; let keyIndex = 0;
  counts.forEach((count, rowIndex) => {
    const keySize = 48, gap = 14, rowWidth = count * keySize + (count - 1) * gap, startX = 600 - rowWidth / 2 + rowIndex * 5;
    for (let i = 0; i < count; i += 1) { const x = startX + i * (keySize + gap), y = 900 + rowIndex * 61; ctx.fillStyle = '#fffdf8'; ctx.strokeStyle = rose; ctx.lineWidth = 3; rounded(x, y, keySize, 38, 8); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#a53f55'; ctx.textAlign = 'center'; ctx.font = 'bold 15px monospace'; ctx.fillText(labels[keyIndex++], x + keySize / 2, y + 10); }
  });
  ctx.fillStyle = '#fff0f0'; ctx.strokeStyle = rose; rounded(430, 1155, 340, 36, 8); ctx.fill(); ctx.stroke();
  line(105, 835, 250, 780, 8); line(1045, 820, 1100, 820, 8);
  ctx.fillStyle = '#b94a61'; ctx.textAlign = 'center'; ctx.font = 'bold 24px sans-serif'; ctx.fillText("TODAY'S RECEIPT", 600, 1315);
  const link = document.createElement('a'); link.download = `今日打字机小票-${Date.now()}.png`; link.href = canvas.toDataURL('image/png'); link.click();
  ctx.textAlign = 'left'; toast('小票已经保存'); playClick(520, .15);
}

function reset() {
  stopCamera(); state.imageUrl = ''; state.location = '此刻所在的地方'; state.weather = '天气未记录';
  els.file.value = ''; els.polaroid.classList.remove('flipped'); showOnly(state.isMobile ? 'mobile' : 'desktop');
}

$('#polaroidButton').addEventListener('click', openCamera);
$('#closeCameraButton').addEventListener('click', closeCamera);
$('#switchCameraButton').addEventListener('click', async () => { state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment'; await openCamera(); });
$('#shutterButton').addEventListener('click', capturePhoto);
$('#desktopUploadButton').addEventListener('click', () => els.file.click());
$('#mobileUploadButton').addEventListener('click', () => els.file.click());
$('#chooseAgainButton').addEventListener('click', () => els.file.click());
$('#makeReceiptButton').addEventListener('click', makeReceipt);
$('#redoButton').addEventListener('click', reset);
$('#homeButton').addEventListener('click', reset);
$('#changeQuoteButton').addEventListener('click', changeQuote);
$('#downloadButton').addEventListener('click', () => downloadReceipt().catch(() => toast('保存失败，请稍后重试')));
$('#soundButton').addEventListener('click', (event) => { state.sound = !state.sound; event.currentTarget.querySelector('span').textContent = state.sound ? '♪' : '×'; event.currentTarget.setAttribute('aria-label', state.sound ? '关闭声音' : '打开声音'); });
els.file.addEventListener('change', event => { handleFile(event.target.files[0]); closeCamera(); });

['dragenter', 'dragover'].forEach(type => window.addEventListener(type, event => { event.preventDefault(); if (!state.isMobile) els.drop.hidden = false; }));
['dragleave', 'drop'].forEach(type => window.addEventListener(type, event => { event.preventDefault(); els.drop.hidden = true; }));
window.addEventListener('drop', event => handleFile(event.dataTransfer.files[0]));
window.addEventListener('beforeunload', stopCamera);

detectDevice();

import { preload, removeBackground } from '@imgly/background-removal';

const $ = (selector) => document.querySelector(selector);

const els = {
  stage: $('#stage'), intro: $('#introCopy'), upload: $('#uploadScene'), device: $('#deviceLabel'),
  preview: $('#previewPanel'), previewImage: $('#previewImage'), photoMeta: $('#photoMeta'), subjectStatus: $('#subjectStatus'),
  printing: $('#printingScene'), typewriter: $('#printingScene .typewriter-model'), keyboard: $('#modelKeyboard'), carriage: $('#typewriterCarriage'),
  printingStatus: $('#printingStatus'), printingActions: $('#printingActions'), typedReceipt: $('#typedReceipt'), receiptPhoto: $('#receiptPhoto'),
  file: $('#fileInput'), export: $('#exportCanvas'), drop: $('#dropZone'), toast: $('#toast')
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

const receiptTones = [
  { name: '复古白', paper: '#f3eddd', ink: '#28231e' },
  { name: '雾蓝', paper: '#a9c8cf', ink: '#263236' },
  { name: '旧黄', paper: '#e1c86e', ink: '#362e1c' },
  { name: '薄荷绿', paper: '#95c997', ink: '#213326' },
  { name: '砖红', paper: '#c46d66', ink: '#281819' },
  { name: '灰紫', paper: '#afa0c3', ink: '#2c2534' }
];

const removalConfig = {
  model: 'small', device: 'gpu', rescale: false, proxyToWorker: false,
  output: { format: 'image/png', quality: .9 }
};

const state = {
  isMobile: false, imageUrl: '', stickerUrl: '', exportBlob: null, processingId: 0, sound: true,
  quoteIndex: Math.floor(Math.random() * quotes.length), location: '此刻所在的地方', weather: '天气未记录',
  date: new Date(), objectUrl: null, processingPromise: null, lockedImageUrl: '',
  receiptTone: receiptTones[Math.floor(Math.random() * receiptTones.length)]
};

const warmModel = () => preload(removalConfig).catch(() => {});
warmModel();

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
  $('#downloadButton').textContent = state.isMobile ? '保存到相册' : '保存小票';
}

function showOnly(name) {
  const sections = { upload: els.upload, preview: els.preview, printing: els.printing };
  Object.entries(sections).forEach(([key, element]) => { element.hidden = key !== name; });
  els.intro.hidden = name !== 'upload';
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

async function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) { toast('请选择一张图片文件'); return; }
  if (file.size > 18 * 1024 * 1024) { toast('照片有点大，请选择 18MB 以内的图片'); return; }
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  if (state.stickerUrl) URL.revokeObjectURL(state.stickerUrl);
  state.objectUrl = URL.createObjectURL(file);
  state.stickerUrl = '';
  state.lockedImageUrl = '';
  state.receiptTone = receiptTones[Math.floor(Math.random() * receiptTones.length)];
  applyReceiptTone();
  const processingId = ++state.processingId;
  const image = new Image();
  image.onload = () => {
    const dimensions = `${image.naturalWidth} × ${image.naturalHeight}`;
    setPhoto(state.objectUrl, dimensions, true);
    state.processingPromise = (async () => {
      try {
        els.subjectStatus.textContent = '正在压缩照片，准备快速抠图';
        const optimizedInput = await resizeForSegmentation(image);
        const cutoutBlob = await removeBackground(optimizedInput, {
          ...removalConfig,
          progress: (key, current, total) => {
            if (processingId !== state.processingId || !total) return;
            const progress = Math.min(99, Math.round(current / total * 100));
            updateProcessingStatus(key.startsWith('compute:') ? '正在提取照片主体' : `正在准备抠图模型 ${progress}%`);
          }
        });
        if (processingId !== state.processingId) return;
        const stickerBlob = await createStickerBlob(cutoutBlob);
        if (processingId !== state.processingId) return;
        state.stickerUrl = URL.createObjectURL(stickerBlob);
        setPhoto(state.stickerUrl, dimensions, false);
      } catch (error) {
        if (processingId !== state.processingId) return;
        console.warn('Subject extraction failed:', error);
        finishPhotoProcessing(false);
        toast('主体识别失败，已保留原照片');
      }
    })();
  };
  image.onerror = () => { state.processingPromise = Promise.resolve(); toast('暂时无法读取这张照片，请换一张试试'); };
  image.src = state.objectUrl;
}

function updateProcessingStatus(message) {
  els.subjectStatus.textContent = message;
  if (!els.printing.hidden) els.printingStatus.textContent = message;
}

function resizeForSegmentation(image) {
  const size = state.isMobile ? 896 : 1024;
  const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#f2f0e9'; context.fillRect(0, 0, size, size);
  const width = Math.round(image.naturalWidth * scale), height = Math.round(image.naturalHeight * scale);
  context.drawImage(image, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Photo resize failed')), 'image/jpeg', .84));
}

function applyReceiptTone() {
  const { paper, ink } = state.receiptTone;
  $('#printingPaper').style.setProperty('--ticket-paper', paper);
  $('#printingPaper').style.setProperty('--ticket-ink', ink);
}

function setPhoto(url, dimensions, processing = false) {
  const printingInProgress = !els.printing.hidden;
  const receiptLocked = printingInProgress && els.printing.classList.contains('is-complete');
  state.imageUrl = url; state.exportBlob = null; state.date = new Date();
  els.previewImage.src = url;
  if (!receiptLocked) els.receiptPhoto.src = url;
  els.photoMeta.dataset.dimensions = dimensions;
  if (!printingInProgress) showOnly('preview');
  if (processing) {
    els.preview.classList.add('is-processing');
    els.subjectStatus.hidden = false;
    els.subjectStatus.textContent = '正在识别照片主体';
    $('#makeReceiptButton').disabled = false;
    els.photoMeta.textContent = `${dimensions}，正在本地制作最终贴纸。`;
  } else {
    finishPhotoProcessing(true);
  }
}

function finishPhotoProcessing(succeeded) {
  els.preview.classList.remove('is-processing');
  els.subjectStatus.hidden = true;
  $('#makeReceiptButton').disabled = false;
  const dimensions = els.photoMeta.dataset.dimensions || '照片';
  els.photoMeta.textContent = succeeded
    ? `${dimensions}，主体贴纸已生成，照片只在你的浏览器中处理。`
    : `${dimensions}，已使用原照片，照片只在你的浏览器中处理。`;
}

async function createStickerBlob(cutoutBlob) {
  const source = await blobToImage(cutoutBlob);
  const scan = document.createElement('canvas');
  scan.width = source.naturalWidth; scan.height = source.naturalHeight;
  const scanContext = scan.getContext('2d', { willReadFrequently: true });
  scanContext.drawImage(source, 0, 0);
  const pixels = scanContext.getImageData(0, 0, scan.width, scan.height).data;
  let minX = scan.width, minY = scan.height, maxX = 0, maxY = 0;
  for (let y = 0; y < scan.height; y += 2) {
    for (let x = 0; x < scan.width; x += 2) {
      if (pixels[(y * scan.width + x) * 4 + 3] > 18) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
  }
  if (minX > maxX || minY > maxY) throw new Error('No foreground detected');
  const cropWidth = maxX - minX + 1, cropHeight = maxY - minY + 1;
  const scale = Math.min(1, 960 / Math.max(cropWidth, cropHeight));
  const outline = Math.min(44, Math.max(16, Math.round(Math.max(cropWidth, cropHeight) * scale * .045)));
  const padding = outline * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(cropWidth * scale + padding * 2);
  canvas.height = Math.ceil(cropHeight * scale + padding * 2);
  const context = canvas.getContext('2d');
  const drawX = padding - minX * scale, drawY = padding - minY * scale;
  context.save();
  context.globalAlpha = .18;
  context.filter = `brightness(0) blur(${Math.max(3, outline * .35)}px)`;
  context.drawImage(source, drawX + outline * .45, drawY + outline * .65, source.naturalWidth * scale, source.naturalHeight * scale);
  context.restore();
  context.save();
  context.globalCompositeOperation = 'source-over';
  context.filter = 'brightness(0) invert(1)';
  const samples = 36;
  for (let radius = outline; radius >= outline * .45; radius -= Math.max(2, outline * .22)) {
    for (let index = 0; index < samples; index += 1) {
      const angle = Math.PI * 2 * index / samples;
      context.drawImage(source, drawX + Math.cos(angle) * radius, drawY + Math.sin(angle) * radius, source.naturalWidth * scale, source.naturalHeight * scale);
    }
  }
  context.restore();
  const foreground = document.createElement('canvas');
  foreground.width = canvas.width; foreground.height = canvas.height;
  const foregroundContext = foreground.getContext('2d', { willReadFrequently: true });
  foregroundContext.filter = 'grayscale(1) contrast(1.18)';
  foregroundContext.drawImage(source, drawX, drawY, source.naturalWidth * scale, source.naturalHeight * scale);
  const styled = foregroundContext.getImageData(0, 0, foreground.width, foreground.height);
  const matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < foreground.height; y += 1) {
    for (let x = 0; x < foreground.width; x += 1) {
      const index = (y * foreground.width + x) * 4;
      if (styled.data[index + 3] < 8) continue;
      const gray = styled.data[index];
      const threshold = (matrix[(y % 4) * 4 + (x % 4)] - 7.5) * 3.4;
      const tone = Math.max(0, Math.min(255, Math.round((gray + threshold) / 64) * 64));
      styled.data[index] = tone; styled.data[index + 1] = tone; styled.data[index + 2] = tone;
    }
  }
  foregroundContext.putImageData(styled, 0, 0);
  context.drawImage(foreground, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Sticker export failed')), 'image/png'));
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Cutout image failed to load')); };
    image.src = url;
  });
}

async function getContextInfo() {
  state.location = '此刻所在的地方'; state.weather = '天气未记录';
  if (!navigator.geolocation) return;
  try {
    const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 1800, maximumAge: 600000 }));
    const { latitude, longitude } = position.coords;
    const controller = new AbortController();
    const stopRequests = setTimeout(() => controller.abort(), 1800);
    const [placeResult, weatherResult] = await Promise.allSettled([
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=13&accept-language=zh-CN`, { signal: controller.signal }).then(r => r.ok ? r.json() : Promise.reject()),
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`, { signal: controller.signal }).then(r => r.ok ? r.json() : Promise.reject())
    ]);
    clearTimeout(stopRequests);
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
  const makeButton = $('#makeReceiptButton');
  const chooseButton = $('#chooseAgainButton');
  const originalButtonLabel = makeButton.textContent;
  makeButton.disabled = true; chooseButton.disabled = true;
  makeButton.textContent = '正在准备最终贴纸';
  els.subjectStatus.hidden = false;
  els.subjectStatus.textContent = '正在完成照片的最终效果';
  try {
    await (state.processingPromise || Promise.resolve());
  } finally {
    makeButton.textContent = originalButtonLabel;
    makeButton.disabled = false; chooseButton.disabled = false;
  }
  if (!state.imageUrl) { toast('照片还没有准备好，请重新选择'); return; }

  state.lockedImageUrl = state.imageUrl;
  els.receiptPhoto.src = state.lockedImageUrl;
  showOnly('printing'); playClick(120, .12);
  els.printing.classList.remove('is-complete');
  els.printingActions.hidden = true;
  els.typedReceipt.classList.remove('is-printing', 'is-printed');
  els.printingStatus.textContent = '正在读取今天的信息';
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
    carriageStep += 1;
    if (carriageStep > 12) {
      carriageStep = 0;
      els.carriage.classList.add('is-returning');
      if (!reduceMotion) els.carriage.style.setProperty('--carriage-x', state.isMobile ? '-2%' : '-5.4%');
      setTimeout(() => els.carriage.classList.remove('is-returning'), 170);
    } else if (!reduceMotion) {
      const carriageTravel = state.isMobile ? .3 : .9;
      els.carriage.style.setProperty('--carriage-x', `${(carriageStep - 6) * carriageTravel}%`);
    }
    playClick(155 + Math.random() * 95, .035);
  }, reduceMotion ? 440 : 120);
  const messages = ['正在打印照片', '正在补上日期与时间', '正在写下今天的一句话'];
  let index = 0; els.printingStatus.textContent = messages[0];
  const timer = setInterval(() => { index = Math.min(index + 1, messages.length - 1); els.printingStatus.textContent = messages[index]; playClick(180 + index * 35); }, 520);
  fillReceipt();
  getContextInfo().then(() => {
    fillReceipt();
    if (!els.printingActions.hidden) renderReceiptBlob().then(blob => { state.exportBlob = blob; }).catch(() => {});
  });
  void els.typedReceipt.offsetWidth;
  els.typedReceipt.classList.add('is-printing');
  const minimumPrint = new Promise(resolve => setTimeout(resolve, reduceMotion ? 80 : 1750));
  await minimumPrint;
  clearInterval(timer); clearInterval(keyTimer); keys.forEach(key => key.classList.remove('pressed')); activeKey = null; els.typewriter.classList.remove('is-typing'); els.carriage.classList.remove('is-returning');
  els.carriage.style.removeProperty('--carriage-x'); els.typedReceipt.classList.remove('is-printing'); els.typedReceipt.classList.add('is-printed');
  els.printing.classList.add('is-complete'); els.printingStatus.textContent = '正在准备保存图片';
  try { state.exportBlob = await renderReceiptBlob(); } catch (_) { state.exportBlob = null; }
  els.printingActions.hidden = false; els.printingStatus.textContent = '打印完成'; playClick(440, .18);
}

function fillReceipt() {
  const d = state.date;
  $('#receiptDate').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  $('#receiptTime').textContent = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  $('#receiptPlace').textContent = state.location; $('#receiptWeather').textContent = state.weather;
  $('#receiptQuote').textContent = `“${quotes[state.quoteIndex]}”`;
  $('#receiptNumber').textContent = `NO. ${String(d.getMonth() + 1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}

function changeQuote() {
  state.quoteIndex = (state.quoteIndex + 1) % quotes.length; state.exportBlob = null; fillReceipt(); playClick(330);
  renderReceiptBlob().then(blob => { state.exportBlob = blob; }).catch(() => {});
}

function drawContain(ctx, image, x, y, width, height) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale, drawHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

async function renderReceiptBlob() {
  const canvas = els.export, ctx = canvas.getContext('2d'); canvas.width = 760; canvas.height = 1420;
  const { paper, ink, name } = state.receiptTone;
  const image = new Image(); image.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = state.lockedImageUrl || state.imageUrl; });
  const line = (x1, y1, x2, y2, width = 2) => { ctx.lineWidth = width; ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  const fitText = (text, x, y, maxWidth, lineHeight, maxLines = 2) => {
    const chars = [...text]; let row = '', rows = [];
    chars.forEach(char => { const test = row + char; if (ctx.measureText(test).width > maxWidth && row) { rows.push(row); row = char; } else row = test; });
    if (row) rows.push(row); rows.slice(0, maxLines).forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
  };
  const drawRightFit = (text, x, y, maxWidth, initialSize = 25) => {
    let size = initialSize;
    do { ctx.font = `600 ${size}px "Avenir Next", sans-serif`; size -= 1; } while (ctx.measureText(text).width > maxWidth && size > 16);
    ctx.fillText(text, x, y);
  };

  ctx.fillStyle = paper; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = ink; ctx.globalAlpha = .025;
  for (let y = 10; y < canvas.height; y += 15) ctx.fillRect(0, y, canvas.width, 1);
  ctx.globalAlpha = 1; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  ctx.font = '900 64px "Courier New", monospace'; ctx.fillText("TODAY'S RECEIPT", 380, 74);
  ctx.font = '700 15px "Courier New", monospace'; ctx.letterSpacing = '6px'; ctx.fillText('MEMORY ARCHIVE', 380, 141); ctx.letterSpacing = '0px';
  ctx.textAlign = 'left'; ctx.font = '700 19px "Courier New", monospace'; ctx.fillText('DATE', 68, 202); ctx.fillText('TIME', 68, 236);
  ctx.textAlign = 'right'; drawRightFit($('#receiptDate').textContent, 692, 202, 390, 21); drawRightFit($('#receiptTime').textContent, 692, 236, 390, 21);
  ctx.setLineDash([8, 7]); line(66, 282, 694, 282); ctx.setLineDash([]);

  ctx.save(); ctx.filter = 'grayscale(1) contrast(1.12)'; drawContain(ctx, image, 88, 316, 584, 448); ctx.restore();
  ctx.textAlign = 'center'; ctx.font = '700 14px "Courier New", monospace'; ctx.fillText('[ LO-FI DITHERED PRINT ]', 380, 786);
  ctx.setLineDash([8, 7]); line(66, 832, 694, 832); ctx.setLineDash([]);
  const rows = [['PLACE', state.location], ['WEATHER', state.weather], ['PAPER', name], ['SERIAL', $('#receiptNumber').textContent.replace('NO. ', '')]];
  rows.forEach((row, index) => {
    const y = 866 + index * 44;
    ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.font = '700 19px "Courier New", monospace'; ctx.fillText(row[0], 68, y);
    ctx.textAlign = 'right'; drawRightFit(row[1], 692, y, 430, 21);
  });
  ctx.setLineDash([8, 7]); line(66, 1054, 694, 1054); ctx.setLineDash([]);
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.font = '700 25px "Avenir Next", sans-serif'; fitText(`“${quotes[state.quoteIndex]}”`, 380, 1090, 590, 38, 2);
  ctx.setLineDash([8, 7]); line(66, 1188, 694, 1188); ctx.setLineDash([]);
  const code = $('#receiptNumber').textContent.replace(/\D/g, '') || '08170000';
  let barcodeX = 218;
  for (let index = 0; index < 48; index += 1) {
    const digit = Number(code[index % code.length]);
    const width = 2 + ((digit + index) % 3) * 2;
    ctx.fillRect(barcodeX, 1224, width, 76); barcodeX += width + 3 + (index % 2);
  }
  ctx.font = '700 14px "Courier New", monospace'; ctx.fillText(code, 380, 1312);
  ctx.font = '700 18px "Courier New", monospace'; ctx.letterSpacing = '7px'; ctx.fillText('THANK YOU', 380, 1345);
  ctx.font = '700 13px "Courier New", monospace'; ctx.letterSpacing = '4px'; ctx.fillText('HAVE A NICE DAY', 380, 1376); ctx.letterSpacing = '0px'; ctx.textAlign = 'left';
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Receipt export failed')), 'image/png'));
  ctx.textAlign = 'left'; return blob;
}

async function saveReceipt() {
  const filename = `今日打字机小票-${Date.now()}.png`;
  const blob = state.exportBlob || await renderReceiptBlob();
  state.exportBlob = blob;
  if (state.isMobile && navigator.canShare) {
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Today's Receipt" });
        toast('已完成系统保存操作'); playClick(520, .15); return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }
  }
  downloadBlob(blob, filename);
  toast(state.isMobile ? '浏览器不支持直接存入相册，已改为下载图片' : '小票已经保存');
  playClick(520, .15);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename; link.href = url; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reset() {
  state.processingId += 1; state.imageUrl = ''; state.exportBlob = null; state.location = '此刻所在的地方'; state.weather = '天气未记录';
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  if (state.stickerUrl) URL.revokeObjectURL(state.stickerUrl);
  state.objectUrl = null; state.stickerUrl = ''; state.processingPromise = null; state.lockedImageUrl = '';
  els.file.value = ''; showOnly('upload');
}

$('#uploadButton').addEventListener('click', () => els.file.click());
$('#chooseAgainButton').addEventListener('click', () => els.file.click());
$('#makeReceiptButton').addEventListener('click', makeReceipt);
$('#redoButton').addEventListener('click', reset);
$('#homeButton').addEventListener('click', reset);
$('#changeQuoteButton').addEventListener('click', changeQuote);
$('#downloadButton').addEventListener('click', () => saveReceipt().catch(() => toast('保存失败，请稍后重试')));
$('#soundButton').addEventListener('click', (event) => { state.sound = !state.sound; event.currentTarget.querySelector('span').textContent = state.sound ? '♪' : '×'; event.currentTarget.setAttribute('aria-label', state.sound ? '关闭声音' : '打开声音'); });
els.file.addEventListener('change', event => handleFile(event.target.files[0]));

['dragenter', 'dragover'].forEach(type => window.addEventListener(type, event => { event.preventDefault(); if (!state.isMobile) els.drop.hidden = false; }));
['dragleave', 'drop'].forEach(type => window.addEventListener(type, event => { event.preventDefault(); els.drop.hidden = true; }));
window.addEventListener('drop', event => handleFile(event.dataTransfer.files[0]));
detectDevice();

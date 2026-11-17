/**
 * Bộ điều khiển Landing Page full-screen:
 * 1. Hoạt ảnh nhân vật 3D theo con trỏ chuột (Hub-and-Spoke) + lặp đuôi mượt khi treo chuột lâu.
 * 2. Đốm sáng xanh sage thay thế con trỏ chuột mặc định (trên desktop).
 * 3. Tự động căn tỷ lệ chiều dài 3 dòng tiêu đề góc trên bên trái.
 * 4. Tối ưu tải ảnh theo hàng đợi và khung hình dọc cho điện thoại.
 */

const CLIPS = {
  idle: { folder: 'frames/idle', count: 74, loopStart: 0, loopEnd: 73, loopFps: 14 },
  left: { folder: 'frames/left', count: 74, loopStart: 37, loopEnd: 73, loopFps: 12 },
  right: { folder: 'frames/right', count: 74, loopStart: 37, loopEnd: 73, loopFps: 12 },
  center: { folder: 'frames/center', count: 74, loopStart: 57, loopEnd: 73, loopFps: 16 },
};

const canvas = document.getElementById('characterCanvas');
const ctx = canvas.getContext('2d');
const loaderBadge = document.getElementById('loaderBadge');
const loaderText = document.getElementById('loaderText');
const cursorGlow = document.getElementById('cursorGlow');

const brandFirst = document.getElementById('brandFirst');
const brandFull = document.getElementById('brandFull');
const brandRole = document.getElementById('brandRole');

const bubbles = {
  left: document.getElementById('bubbleLeft'),
  right: document.getElementById('bubbleRight'),
  center: document.getElementById('bubbleCenter'),
};

const touchButtons = document.querySelectorAll('.touch-btn');
const ctaElements = document.querySelectorAll('a, button');

const framesStore = {
  idle: new Array(CLIPS.idle.count),
  left: new Array(CLIPS.left.count),
  right: new Array(CLIPS.right.count),
  center: new Array(CLIPS.center.count),
};

let activeClip = 'idle';
let targetZone = 'idle';
let firstSideLooked = null; // Ghi nhớ bên (left/right) xuất hiện câu 1 trong chu kỳ hiện tại
let sideStep = 0; // 0 = chưa hiện, 1 = đã hiện câu 1, 2 = đã hiện đủ 2 câu (chờ reset)
let sideBubbleTimer = null;
let currentFrame = 0;
let loopDirection = 1;
let hasReachedLoop = false;
let lastTime = performance.now();

let mouseX = -200;
let mouseY = -200;
let glowX = -200;
let glowY = -200;
let isMouseInside = false;

function pad3(num) {
  return String(num).padStart(3, '0');
}

function isFrameReady(clipName, idx) {
  const list = framesStore[clipName];
  if (!list) return false;
  const img = list[idx];
  return Boolean(img && img.complete && img.naturalWidth > 0);
}

/**
 * Tìm khung hình đã tải gần nhất để không bao giờ bị khựng hình trên mạng chậm
 */
function findNearestReadyImage(clipName, targetIdx) {
  const list = framesStore[clipName];
  if (!list) return null;

  if (isFrameReady(clipName, targetIdx)) return list[targetIdx];

  for (let offset = 1; offset < list.length; offset++) {
    const prev = targetIdx - offset;
    if (prev >= 0 && isFrameReady(clipName, prev)) return list[prev];
    const next = targetIdx + offset;
    if (next < list.length && isFrameReady(clipName, next)) return list[next];
  }

  return isFrameReady('idle', 0) ? framesStore.idle[0] : null;
}

/**
 * Điều chỉnh cỡ chữ để:
 * - "Nhật" có chiều dài bằng đúng 2/3 dòng "Nguyễn Ngô Hoàng"
 * - "MULTIMEDIA DESIGNER & CREATIVE TEAM LEADER" có chiều dài bằng đúng dòng "Nguyễn Ngô Hoàng"
 */
function fitBrandTypography() {
  if (!brandFirst || !brandFull || !brandRole) return;

  brandFirst.style.fontSize = '100px';
  brandRole.style.fontSize = '20px';

  const fullWidth = brandFull.getBoundingClientRect().width;
  if (fullWidth <= 0) return;

  const firstBaseWidth = brandFirst.getBoundingClientRect().width;
  if (firstBaseWidth > 0) {
    const targetFirstWidth = fullWidth * (2 / 3);
    brandFirst.style.fontSize = `${(100 * (targetFirstWidth / firstBaseWidth)).toFixed(2)}px`;
  }

  const roleBaseWidth = brandRole.getBoundingClientRect().width;
  if (roleBaseWidth > 0) {
    brandRole.style.fontSize = `${(20 * (fullWidth / roleBaseWidth)).toFixed(2)}px`;
  }
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  drawCurrentFrame();
  fitBrandTypography();
}

/**
 * Vẽ khung hình hiện tại lên canvas:
 * - Trên máy tính (màn hình ngang): phủ kín toàn màn hình (cover).
 * - Trên điện thoại (màn hình dọc): căn vừa đủ để thấy trọn đầu, tay vẫy và laptop, hòa viền mềm vào nền kem.
 */
function drawCurrentFrame() {
  const list = framesStore[activeClip];
  if (!list) return;

  const idx = Math.max(0, Math.min(list.length - 1, Math.round(currentFrame)));
  const img = findNearestReadyImage(activeClip, idx);
  if (!img) return;

  const cw = canvas.width;
  const ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);

  // Phủ nền kem đồng nhất trước khi vẽ
  ctx.fillStyle = '#F4EFE3';
  ctx.fillRect(0, 0, cw, ch);

  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = cw / ch;

  let drawW = cw;
  let drawH = ch;
  let offsetX = 0;
  let offsetY = 0;

  if (canvasRatio >= 1) {
    // Màn hình ngang (Desktop / Laptop)
    if (canvasRatio > imgRatio) {
      drawW = cw;
      drawH = cw / imgRatio;
      offsetY = (ch - drawH) * 0.52;
    } else {
      drawH = ch;
      drawW = ch * imgRatio;
      offsetX = (cw - drawW) / 2;
    }
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
  } else {
    // Màn hình dọc (Điện thoại): thu vừa tầm để thấy cả tay vẫy hai bên và laptop
    drawW = cw * 1.55;
    drawH = drawW / imgRatio;
    offsetX = (cw - drawW) / 2;
    offsetY = (ch - drawH) * 0.56;
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

    // Làm mờ mềm cạnh trên và cạnh dưới ảnh trên điện thoại để hòa vào nền #F4EFE3
    const fadeH = Math.round(drawH * 0.14);
    const topGrad = ctx.createLinearGradient(0, offsetY, 0, offsetY + fadeH);
    topGrad.addColorStop(0, '#F4EFE3');
    topGrad.addColorStop(1, 'rgba(244, 239, 227, 0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, Math.max(0, offsetY - 2), cw, fadeH + 2);

    const bottomY = offsetY + drawH;
    const botGrad = ctx.createLinearGradient(0, bottomY - fadeH, 0, bottomY);
    botGrad.addColorStop(0, 'rgba(244, 239, 227, 0)');
    botGrad.addColorStop(1, '#F4EFE3');
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, bottomY - fadeH, cw, fadeH + 2);
  }
}

/**
 * Tải ảnh theo hàng đợi giới hạn (tối đa 10 ảnh cùng lúc) để Safari trên điện thoại không bị nghẽn
 */
function preloadAllFrames() {
  const queue = [];
  const loadOrder = ['idle', 'center', 'left', 'right'];

  loadOrder.forEach((name) => {
    const info = CLIPS[name];
    for (let i = 1; i <= info.count; i++) {
      queue.push({ name, index: i - 1, src: `${info.folder}/${pad3(i)}.webp` });
    }
  });

  const totalFrames = queue.length;
  let loadedCount = 0;
  let cursor = 0;
  const maxConcurrent = 10;

  function loadNext() {
    if (cursor >= totalFrames) return;
    const item = queue[cursor++];
    const img = new Image();
    framesStore[item.name][item.index] = img;

    const onDone = () => {
      loadedCount++;
      const percent = Math.round((loadedCount / totalFrames) * 100);
      if (loaderText) {
        loaderText.textContent = `Đang chuẩn bị hoạt ảnh... ${percent}%`;
      }

      if (item.name === 'idle' && item.index === 0) {
        drawCurrentFrame();
      }

      if (loadedCount >= totalFrames && loaderBadge) {
        loaderBadge.classList.add('is-done');
      }

      loadNext();
    };

    img.onload = onDone;
    img.onerror = onDone;
    img.src = item.src;
  }

  for (let i = 0; i < maxConcurrent; i++) {
    loadNext();
  }
}

function clearSideBubbleTimer() {
  if (sideBubbleTimer) {
    clearTimeout(sideBubbleTimer);
    sideBubbleTimer = null;
  }
}

function updateTouchButtons(zone) {
  clearSideBubbleTimer();

  if (zone === 'left' || zone === 'right') {
    if (sideStep === 0 || sideStep === 2) {
      // Bắt đầu chu kỳ mới (hoặc reset lại từ đầu sau khi đã hiện đủ 2 câu)
      sideStep = 1;
      firstSideLooked = zone;
    } else if (sideStep === 1 && zone !== firstSideLooked) {
      // Sang bên còn lại -> hiện câu 2 và đánh dấu đã đủ 2 câu
      sideStep = 2;
    }

    const text =
      sideStep === 1
        ? 'Cô này xinh quá ❤️'
        : 'Cô này cũng xinh nữa 🤤';

    if (bubbles[zone]) {
      bubbles[zone].textContent = text;
    }

    // Sau 3.5 giây tự ẩn nhẹ bong bóng thoại để không bị nằm chết trên màn hình
    sideBubbleTimer = setTimeout(() => {
      if (targetZone === zone && bubbles[zone]) {
        bubbles[zone].classList.remove('is-visible');
      }
    }, 3500);
  } else if (zone === 'idle') {
    firstSideLooked = null;
    sideStep = 0;
  }

  Object.entries(bubbles).forEach(([key, el]) => {
    if (!el) return;
    if (key === 'center') {
      // Khung thoại ở giữa chỉ hiện khi nhân vật đã bỏ tai nghe xuống cổ
      el.classList.toggle('is-visible', zone === 'center' && activeClip === 'center' && currentFrame >= 35);
    } else {
      el.classList.toggle('is-visible', key === zone);
    }
  });

  touchButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.zone === zone);
  });
}

function setTargetZone(newZone) {
  if (targetZone === newZone) return;
  targetZone = newZone;
  updateTouchButtons(newZone);
}

/**
 * Vòng lặp 60fps: chỉ tiến frame khi ảnh tiếp theo đã sẵn sàng
 */
function animate(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (isMouseInside && cursorGlow) {
    glowX += (mouseX - glowX) * 0.28;
    glowY += (mouseY - glowY) * 0.28;
    cursorGlow.style.transform = `translate3d(${glowX}px, ${glowY}px, 0) translate(-50%, -50%)`;
  }

  const playFps = 22;
  const rewindFps = 55;
  const clipCfg = CLIPS[activeClip];

  if (activeClip === targetZone) {
    let nextFrame = currentFrame;

    if (!hasReachedLoop) {
      nextFrame = currentFrame + playFps * dt;
      if (nextFrame >= clipCfg.loopEnd) {
        nextFrame = clipCfg.loopEnd;
        hasReachedLoop = true;
        loopDirection = -1;
      }
    } else {
      nextFrame = currentFrame + loopDirection * clipCfg.loopFps * dt;
      if (nextFrame >= clipCfg.loopEnd) {
        nextFrame = clipCfg.loopEnd;
        loopDirection = -1;
      } else if (nextFrame <= clipCfg.loopStart) {
        nextFrame = clipCfg.loopStart;
        loopDirection = 1;
      }
    }

    const nextIdx = Math.max(0, Math.min(clipCfg.count - 1, Math.round(nextFrame)));
    if (isFrameReady(activeClip, nextIdx)) {
      currentFrame = nextFrame;
    }
  } else {
    hasReachedLoop = false;
    if (activeClip !== 'idle' && currentFrame > 0) {
      currentFrame = Math.max(0, currentFrame - rewindFps * dt);
      if (currentFrame === 0) {
        activeClip = targetZone;
        loopDirection = 1;
      }
    } else {
      activeClip = targetZone;
      currentFrame = 0;
      loopDirection = 1;
    }
  }

  drawCurrentFrame();

  // Bật câu thoại ở giữa đúng lúc nhân vật đã bỏ tai nghe xuống cổ (từ frame 35 trở đi)
  if (bubbles.center) {
    const shouldShowCenter = targetZone === 'center' && activeClip === 'center' && currentFrame >= 35;
    bubbles.center.classList.toggle('is-visible', shouldShowCenter);
  }

  requestAnimationFrame(animate);
}

// Chỉ theo dõi di chuyển chuột thật (bỏ qua sự kiện chuột giả lập do chạm trên điện thoại)
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;

  mouseX = e.clientX;
  mouseY = e.clientY;

  if (!isMouseInside) {
    isMouseInside = true;
    glowX = mouseX;
    glowY = mouseY;
    cursorGlow?.classList.add('is-active');
  }

  const relX = e.clientX / window.innerWidth;
  if (relX < 0.35) {
    setTargetZone('left');
  } else if (relX > 0.65) {
    setTargetZone('right');
  } else {
    setTargetZone('center');
  }
});

document.addEventListener('mouseleave', () => {
  isMouseInside = false;
  cursorGlow?.classList.remove('is-active');
  setTargetZone('idle');
});

// Phóng nhẹ vòng sáng khi di chuột vào nút bấm
ctaElements.forEach((el) => {
  el.addEventListener('mouseenter', () => cursorGlow?.classList.add('is-hover-cta'));
  el.addEventListener('mouseleave', () => cursorGlow?.classList.remove('is-hover-cta'));
});

// Hỗ trợ chạm trực tiếp lên màn hình (ngoài 3 nút bấm) trên điện thoại
canvas.addEventListener('click', (e) => {
  if (window.matchMedia('(pointer: fine)').matches) return;
  const relX = e.clientX / window.innerWidth;
  if (relX < 0.35) {
    setTargetZone('left');
  } else if (relX > 0.65) {
    setTargetZone('right');
  } else {
    setTargetZone('center');
  }
});

// Nút điều khiển trên thiết bị cảm ứng
touchButtons.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const zone = btn.dataset.zone;
    setTargetZone(targetZone === zone ? 'idle' : zone);
  });
});

window.addEventListener('resize', resizeCanvas);
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(fitBrandTypography);
}

resizeCanvas();
preloadAllFrames();
requestAnimationFrame(animate);

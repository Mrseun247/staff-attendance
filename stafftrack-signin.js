// ════════════════════════════════════════════════
// CONFIG — reads from same localStorage as admin
// ════════════════════════════════════════════════
const STORAGE_KEYS = {
  staff:      'vmis_staff',
  logs:       'vmis_logs',
  scriptUrl:  'vmis_script_url',
  school:     'vmis_school',
  rules:      'vmis_rules',
  pins:       'vmis_pins',           // { staffId: hashedPin }
  deviceLog:  'vmis_device_sessions' // { date: { staffId, name, status, time } }
};

function getStaff()     { return JSON.parse(localStorage.getItem(STORAGE_KEYS.staff)     || '[]'); }
function getLogs()      { return JSON.parse(localStorage.getItem(STORAGE_KEYS.logs)      || '[]'); }
function getScriptUrl() { return localStorage.getItem(STORAGE_KEYS.scriptUrl) || ''; }
function getSchool()    { return JSON.parse(localStorage.getItem(STORAGE_KEYS.school)    || '{"name":"Victory Montessori Int\'l School"}'); }
function getPins()      { return JSON.parse(localStorage.getItem(STORAGE_KEYS.pins)      || '{}'); }
function getDeviceLog() { return JSON.parse(localStorage.getItem(STORAGE_KEYS.deviceLog) || '{}'); }

function saveLogs(logs) { localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(logs)); }
function savePins(pins) { localStorage.setItem(STORAGE_KEYS.pins, JSON.stringify(pins)); }
function saveDeviceLog(dl) { localStorage.setItem(STORAGE_KEYS.deviceLog, JSON.stringify(dl)); }

// ════════════════════════════════════════════════
// DATE / TIME HELPERS
// ════════════════════════════════════════════════
function nowDateStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function nowTimeStr() {
  const d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0');
}
function nowDayStr() {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
}
function fmtTime(d) {
  return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(d) {
  return d.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ════════════════════════════════════════════════
// PIN HASHING (simple but effective for local use)
// ════════════════════════════════════════════════
async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(pin + salt);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
// Device-level salt (unique per browser, persists across sessions)
function getDeviceSalt() {
  let s = localStorage.getItem('vmis_device_salt');
  if (!s) { s = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36); localStorage.setItem('vmis_device_salt', s); }
  return s;
}

// ════════════════════════════════════════════════
// SCREEN MANAGEMENT
// ════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

// ════════════════════════════════════════════════
// CLOCK
// ════════════════════════════════════════════════
function updateClock() {
  const now = new Date();
  document.getElementById('idleClock').textContent = fmtTime(now);
  document.getElementById('idleDate').textContent  = fmtDate(now);
}
setInterval(updateClock, 1000);
updateClock();

// school name from admin settings
const school = getSchool();
document.getElementById('idleSchoolName').textContent = school.name || "Victory Montessori Int'l School";

// ════════════════════════════════════════════════
// DEVICE SESSION LOCK
// Prevents a second person signing in on same device
// in the same half-day window (morning / afternoon)
// ════════════════════════════════════════════════
function getShift() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : 'afternoon';
}

function deviceLockKey() {
  return nowDateStr() + '_' + getShift();
}

function getDeviceSession() {
  const dl  = getDeviceLog();
  return dl[deviceLockKey()] || null;
}

function setDeviceSession(staffData) {
  const dl = getDeviceLog();
  dl[deviceLockKey()] = {
    staffId:  staffData.id,
    staffName: staffData.name,
    time:     nowTimeStr(),
    date:     nowDateStr(),
    shift:    getShift()
  };
  saveDeviceLog(dl);
}

// Clean old device sessions automatically
function cleanDeviceSessions() {
  const today = nowDateStr();
  const dl = getDeviceLog();
  const cleaned = {};
  Object.entries(dl).forEach(([k, v]) => {
    if (v.date === today) cleaned[k] = v;
  });
  saveDeviceLog(cleaned);
}

// ════════════════════════════════════════════════
// SCANNER
// ════════════════════════════════════════════════
let cameraStream  = null;
let scanInterval  = null;
let scanCooldown  = false; // prevent rapid double-scans

async function openScanner() {
  // Check device lock first
  const session = getDeviceSession();
  if (session) {
    showBlockedScreen({ reason: 'device', session });
    return;
  }

  showScreen('scan');
  document.getElementById('scanHint').textContent = '📋 Hold QR card steady inside the frame';

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    document.getElementById('scanVideo').srcObject = cameraStream;
    scanInterval = setInterval(scanFrame, 250);
  } catch (err) {
    alert('Camera access denied. Please allow camera permission and try again.');
    closeScanner();
  }
}

function closeScanner() {
  stopCamera();
  showScreen('idle');
}

function stopCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
}

function scanFrame() {
  if (scanCooldown) return;
  const video  = document.getElementById('scanVideo');
  const canvas = document.getElementById('scanCanvas');
  if (!video.videoWidth) return;

  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });

  if (code && code.data) {
    let parsed = null;
    try { parsed = JSON.parse(code.data); } catch {}
    if (parsed && parsed.id && parsed.name) {
      scanCooldown = true;
      stopCamera();
      processQRData(parsed);
    }
  }
}

function manualEntry() {
  const id = prompt('Enter your Staff ID:');
  if (!id) return;
  const staff = getStaff().find(s => s.id === id.trim().toUpperCase() || s.id === id.trim());
  if (!staff) {
    alert(`No staff found with ID: "${id}". Please check your ID card.`);
    return;
  }
  stopCamera();
  processQRData(staff);
}

// ════════════════════════════════════════════════
// CORE LOGIC: Process scanned QR
// ════════════════════════════════════════════════
let pendingStaff = null;

function processQRData(data) {
  const staff = getStaff().find(s => s.id === data.id);
  if (!staff) {
    alert('Staff not found in system. Please contact administration.');
    scanCooldown = false;
    showScreen('scan');
    openScanner();
    return;
  }

  // Check 1: Has this STAFF already signed in/out today for this shift?
  const today   = nowDateStr();
  const shift   = getShift();
  const allLogs = getLogs();

  // Staff can do exactly 2 actions per day: morning IN + afternoon OUT
  // Count today's total records for this staff
  const todayRecords = allLogs.filter(l => l.id === staff.id && l.date === today);

  // Check if staff has already done both actions (IN + OUT)
  const hasIn  = todayRecords.some(l => l.status === 'IN');
  const hasOut = todayRecords.some(l => l.status === 'OUT');

  if (hasIn && hasOut) {
    showBlockedScreen({ reason: 'done', staff, todayRecords });
    return;
  }

  // Determine action
  const action = !hasIn ? 'IN' : 'OUT';
  const actionLabel = action === 'IN' ? 'MORNING SIGN-IN' : 'AFTERNOON SIGN-OUT';

  // Double-scan guard: if staff already signed IN and it's still morning, block
  if (action === 'OUT' && shift === 'morning') {
    showBlockedScreen({ reason: 'already_in', staff, todayRecords });
    return;
  }

  pendingStaff = { ...staff, action };

  // Show confirm screen
  showConfirmScreen(staff, action, actionLabel);
}

// ════════════════════════════════════════════════
// CONFIRM SCREEN
// ════════════════════════════════════════════════
function showConfirmScreen(staff, action, label) {
  const now = new Date();

  document.getElementById('confirmAvatar').textContent  = staff.name.charAt(0).toUpperCase();
  document.getElementById('confirmName').textContent    = staff.name;
  document.getElementById('confirmRole').textContent    = `${staff.role} · ${staff.dept}`;
  document.getElementById('confirmId').textContent      = `ID: ${staff.id}`;
  document.getElementById('confirmTime').textContent    = fmtTime(now);
  document.getElementById('confirmDate').textContent    = now.toLocaleDateString('en-NG', { day:'numeric', month:'short' });
  document.getElementById('confirmDay').textContent     = now.toLocaleDateString('en-NG', { weekday:'short' });

  const badge     = document.getElementById('confirmBadge');
  const badgeIcon = document.getElementById('confirmBadgeIcon');
  const badgeText = document.getElementById('confirmBadgeText');

  badge.className = `confirm-action-badge ${action === 'IN' ? 'in' : 'out'}`;
  badgeIcon.textContent = action === 'IN' ? '🌅' : '🌆';
  badgeText.textContent = label;

  // PIN flow
  const pins = getPins();
  if (!pins[staff.id]) {
    // First time — ask to set a PIN
    openPinSetup(staff);
  } else {
    // Returning — ask for PIN verification
    resetPinInput();
    showScreen('confirm');
  }
}

// ════════════════════════════════════════════════
// PIN SETUP (first-time registration)
// ════════════════════════════════════════════════
let setupBuffer  = '';
let setupStaff   = null;
let setupPhase   = 'create'; // 'create' | 'confirm'
let setupFirst   = '';

function openPinSetup(staff) {
  setupStaff  = staff;
  setupBuffer = '';
  setupFirst  = '';
  setupPhase  = 'create';
  document.getElementById('pinSetupName').textContent = staff.name;
  document.getElementById('pinSetupHint').textContent = 'Enter 4 digits';
  renderSetupDots();
  document.getElementById('pinSetupOverlay').classList.add('open');
  showScreen('confirm');
}

function cancelPinSetup() {
  document.getElementById('pinSetupOverlay').classList.remove('open');
  goIdle();
}

function setupKey(d) {
  if (setupBuffer.length >= 4) return;
  setupBuffer += d;
  renderSetupDots();
  if (setupBuffer.length === 4) {
    setTimeout(() => {
      if (setupPhase === 'create') {
        setupFirst  = setupBuffer;
        setupBuffer = '';
        setupPhase  = 'confirm';
        document.getElementById('pinSetupHint').textContent = 'Re-enter PIN to confirm';
        renderSetupDots();
      } else {
        if (setupBuffer === setupFirst) {
          // Save PIN
          hashPin(setupBuffer, getDeviceSalt()).then(hashed => {
            const pins = getPins();
            pins[setupStaff.id] = hashed;
            savePins(pins);
            document.getElementById('pinSetupOverlay').classList.remove('open');
            // Auto-submit with new PIN
            submitAttendance(pendingStaff);
          });
        } else {
          setupBuffer = '';
          setupFirst  = '';
          setupPhase  = 'create';
          document.getElementById('pinSetupHint').textContent = "❌ PINs didn't match — try again";
          renderSetupDots();
        }
      }
    }, 150);
  }
}
function setupDel() {
  setupBuffer = setupBuffer.slice(0, -1);
  renderSetupDots();
}
function renderSetupDots() {
  for (let i = 0; i < 4; i++) {
    const d = document.getElementById('spd' + i);
    d.className = 'pin-dot' + (i < setupBuffer.length ? ' filled' : '');
  }
}

// ════════════════════════════════════════════════
// PIN VERIFICATION (sign-in confirmation)
// ════════════════════════════════════════════════
let pinBuffer   = '';
let pinAttempts = 0;
const MAX_ATTEMPTS = 5;

function resetPinInput() {
  pinBuffer   = '';
  pinAttempts = 0;
  renderPinDots(false);
}

function pinKey(d) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += d;
  renderPinDots(false);
  if (pinBuffer.length === 4) {
    setTimeout(() => verifyPin(), 100);
  }
}
function pinDel() {
  pinBuffer = pinBuffer.slice(0, -1);
  renderPinDots(false);
}

function renderPinDots(error) {
  for (let i = 0; i < 4; i++) {
    const d = document.getElementById('pd' + i);
    d.className = 'pin-dot' + (error ? ' error' : (i < pinBuffer.length ? ' filled' : ''));
  }
}

async function verifyPin() {
  const pins = getPins();
  const stored = pins[pendingStaff.id];
  const entered = await hashPin(pinBuffer, getDeviceSalt());

  if (entered === stored) {
    submitAttendance(pendingStaff);
  } else {
    pinAttempts++;
    pinBuffer = '';
    renderPinDots(true);
    setTimeout(() => {
      renderPinDots(false);
      if (pinAttempts >= MAX_ATTEMPTS) {
        // Lock this staff out for 10 minutes
        lockStaffOut(pendingStaff, pinAttempts);
      }
    }, 600);
  }
}

function lockStaffOut(staff, attempts) {
  // record failed attempt
  showBlockedScreen({ reason: 'pin_fail', staff, attempts });
}

function cancelConfirm() {
  pinBuffer   = '';
  pinAttempts = 0;
  pendingStaff = null;
  scanCooldown = false;
  goIdle();
}

// ════════════════════════════════════════════════
// SUBMIT ATTENDANCE
// ════════════════════════════════════════════════
function submitAttendance(staffData) {
  const now    = new Date();
  const today  = nowDateStr();
  const entry  = {
    id:         staffData.id,
    name:       staffData.name,
    department: staffData.dept || staffData.department || '',
    role:       staffData.role || '',
    date:       today,
    time:       nowTimeStr(),
    status:     staffData.action,
    day:        nowDayStr(),
    device:     'self-signin',
    shift:      getShift()
  };

  // Save to shared logs
  const logs = getLogs();
  logs.unshift(entry);
  saveLogs(logs);

  // Lock this device for the session
  setDeviceSession(staffData);

  // Post to Google Sheets
  const url = getScriptUrl();
  if (url) {
    fetch(url, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    }).catch(() => {});
  }

  // Show success
  showSuccessScreen(staffData, entry, now);
  scanCooldown = false;
}

// ════════════════════════════════════════════════
// SUCCESS SCREEN
// ════════════════════════════════════════════════
let autoReturnTimer = null;

function showSuccessScreen(staff, entry, now) {
  const screen = document.getElementById('screen-success');
  const isIn   = entry.status === 'IN';

  screen.className = `screen active type-${isIn ? 'in' : 'out'}`;

  document.getElementById('successIcon').textContent  = isIn ? '🌅' : '🌆';
  document.getElementById('successTitle').textContent = isIn ? 'Signed In!' : 'Signed Out!';
  document.getElementById('successSub').textContent   = isIn
    ? `Welcome, ${staff.name.split(' ')[0]}! Have a productive day.`
    : `Good job today, ${staff.name.split(' ')[0]}! See you tomorrow.`;

  document.getElementById('successName').textContent  = staff.name;
  document.getElementById('successMeta').textContent  = `${staff.role} · ${staff.dept}`;
  document.getElementById('successTime').textContent  = fmtTime(now);

  const DURATION = 6;
  document.getElementById('countdownBar').style.setProperty('--drain-duration', DURATION + 's');
  // re-trigger animation
  const bar = document.getElementById('countdownBar');
  bar.style.animation = 'none';
  bar.offsetHeight; // reflow
  bar.style.animation = `drainBar ${DURATION}s linear forwards`;

  let secs = DURATION;
  document.getElementById('countdownTxt').textContent = `Returning to home in ${secs}s…`;
  if (autoReturnTimer) clearInterval(autoReturnTimer);
  autoReturnTimer = setInterval(() => {
    secs--;
    if (secs <= 0) { clearInterval(autoReturnTimer); goIdle(); return; }
    document.getElementById('countdownTxt').textContent = `Returning to home in ${secs}s…`;
  }, 1000);
}

// ════════════════════════════════════════════════
// BLOCKED SCREEN
// ════════════════════════════════════════════════
function showBlockedScreen({ reason, staff, session, todayRecords, attempts }) {
  const screen = document.getElementById('screen-blocked');
  const icon   = document.getElementById('blockedIcon');
  const title  = document.getElementById('blockedTitle');
  const msg    = document.getElementById('blockedMsg');
  const card   = document.getElementById('blockedInfoCard');

  if (reason === 'device') {
    icon.textContent  = '🔒';
    title.textContent = 'Device Locked';
    msg.textContent   = `Another staff member already used this device during the ${session.shift} session. Each device can only be used once per shift to prevent sign-in fraud.`;
    card.innerHTML    = `
      <div class="blocked-row"><span class="lbl">Signed in as</span><span class="val">${session.staffName}</span></div>
      <div class="blocked-row"><span class="lbl">Time</span><span class="val">${session.time}</span></div>
      <div class="blocked-row"><span class="lbl">Session</span><span class="val amber">${session.shift.toUpperCase()}</span></div>
      <div class="blocked-row"><span class="lbl">This device unlocks</span><span class="val green">Next shift / Tomorrow</span></div>`;

  } else if (reason === 'done') {
    const inLog  = todayRecords.find(l => l.status === 'IN');
    const outLog = todayRecords.find(l => l.status === 'OUT');
    icon.textContent  = '✅';
    title.textContent = 'All Done for Today!';
    msg.textContent   = `${staff.name}, you have already completed both sign-in and sign-out for today.`;
    card.innerHTML    = `
      <div class="blocked-row"><span class="lbl">Morning Sign-In</span><span class="val green">${inLog ? inLog.time : '—'}</span></div>
      <div class="blocked-row"><span class="lbl">Afternoon Sign-Out</span><span class="val amber">${outLog ? outLog.time : '—'}</span></div>
      <div class="blocked-row"><span class="lbl">Date</span><span class="val">${nowDateStr()}</span></div>`;

  } else if (reason === 'already_in') {
    const inLog = todayRecords.find(l => l.status === 'IN');
    icon.textContent  = '🌅';
    title.textContent = 'Already Signed In';
    msg.textContent   = `${staff.name}, you already signed in this morning. Sign-out is only available in the afternoon session.`;
    card.innerHTML    = `
      <div class="blocked-row"><span class="lbl">Morning Sign-In</span><span class="val green">${inLog ? inLog.time : '—'}</span></div>
      <div class="blocked-row"><span class="lbl">Sign-Out opens</span><span class="val amber">12:00 PM onwards</span></div>`;

  } else if (reason === 'pin_fail') {
    icon.textContent  = '🚫';
    title.textContent = 'Wrong PIN';
    msg.textContent   = `Too many incorrect PIN attempts for ${staff.name}. Contact admin to reset your PIN.`;
    card.innerHTML    = `
      <div class="blocked-row"><span class="lbl">Failed attempts</span><span class="val">${attempts}</span></div>
      <div class="blocked-row"><span class="lbl">Action</span><span class="val amber">Contact Admin</span></div>`;
  }

  scanCooldown = false;
  showScreen('blocked');
}

// ════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════
function goIdle() {
  if (autoReturnTimer) { clearInterval(autoReturnTimer); autoReturnTimer = null; }
  stopCamera();
  pendingStaff = null;
  pinBuffer    = '';
  pinAttempts  = 0;
  scanCooldown = false;
  showScreen('idle');
}

// ════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════
cleanDeviceSessions();

// Prevent back gesture from closing the page on mobile
history.pushState(null, '', location.href);
window.addEventListener('popstate', () => {
  history.pushState(null, '', location.href);
});

// Prevent right-click / inspection on kiosk mode
document.addEventListener('contextmenu', e => e.preventDefault());

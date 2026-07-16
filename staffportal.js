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

let scriptUrl = new URLSearchParams(location.search).get('api') || localStorage.getItem(STORAGE_KEYS.scriptUrl) || 'https://script.google.com/macros/s/AKfycbz2bGmhJq9XjYni5ondNxIPFBzGsquigfPz7e_fmiV9KdYEeT_bC2N59jMDJF8InQM2/exec';
if (scriptUrl) localStorage.setItem(STORAGE_KEYS.scriptUrl, scriptUrl);

function getStaff()     { return JSON.parse(localStorage.getItem(STORAGE_KEYS.staff)     || '[]'); }
function getLogs()      { return JSON.parse(localStorage.getItem(STORAGE_KEYS.logs)      || '[]'); }
function getScriptUrl() { return scriptUrl || localStorage.getItem(STORAGE_KEYS.scriptUrl) || ''; }
function getSchool()    { return JSON.parse(localStorage.getItem(STORAGE_KEYS.school)    || '{"name":"Victory Montessori Int\'l School"}'); }
function getPins()      { return JSON.parse(localStorage.getItem(STORAGE_KEYS.pins)      || '{}'); }
function getDeviceLog() { return JSON.parse(localStorage.getItem(STORAGE_KEYS.deviceLog) || '{}'); }

function saveLogs(logs) { localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(logs)); }
function savePins(pins) { localStorage.setItem(STORAGE_KEYS.pins, JSON.stringify(pins)); postCloud('savePins', pins); }
function saveDeviceLog(dl) { localStorage.setItem(STORAGE_KEYS.deviceLog, JSON.stringify(dl)); postCloud('saveDeviceSessions', dl); }

async function postCloud(action, data) {
  const url = getScriptUrl();
  if (!url) return Promise.resolve();
  return fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, data })
  }).catch(() => {});
}

function loadCloudData() {
  const url = getScriptUrl();
  if (!url) return Promise.resolve(false);
  const cb = 'staffTrackSignin_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  return new Promise(resolve => {
    const script = document.createElement('script');
    const cleanup = () => { delete window[cb]; script.remove(); };
    window[cb] = data => {
      try {
        if (data && data.ok) {
          localStorage.setItem(STORAGE_KEYS.staff, JSON.stringify(data.staff || []));
          localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(data.logs || []));
          localStorage.setItem(STORAGE_KEYS.pins, JSON.stringify(data.pins || {}));
          localStorage.setItem(STORAGE_KEYS.deviceLog, JSON.stringify(data.deviceSessions || {}));
          if (data.school) localStorage.setItem(STORAGE_KEYS.school, JSON.stringify(data.school));
          resolve(true);
        } else {
          resolve(false);
        }
      } finally {
        cleanup();
      }
    };
    script.onerror = () => { cleanup(); resolve(false); };
    script.src = url + (url.includes('?') ? '&' : '?') + 'action=getData&callback=' + encodeURIComponent(cb) + '&_=' + Date.now();
    document.body.appendChild(script);
  });
}


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
async function hashPin(pin, staffId) {
  const data = new TextEncoder().encode(pin + ':StaffTrack:' + staffId);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
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

function getDeviceId() {
  let id = localStorage.getItem('vmis_device_id');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : 'dev_' + Math.random().toString(36).slice(2);
    localStorage.setItem('vmis_device_id', id);
  }
  return id;
}

function deviceLockKey() {
  return nowDateStr() + '_' + getShift() + '_' + getDeviceId();
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
// SCANNER — fixed
// ════════════════════════════════════════════════
let cameraStream  = null;
let scanInterval  = null;
let scanCooldown  = false;

async function openScanner() {
  showLoading('Loading latest staff data…');
  await loadCloudData();
  hideLoading();

  const count = getStaff().length;
  if (count === 0 && !scriptUrl) {
    openSetupOverlay();
    return;
  }

  const session = getDeviceSession();
  if (session) {
    showBlockedScreen({ reason: 'device', session });
    return;
  }

  showScreen('scan');

  try {
    // prefer rear camera on mobile
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    }
    cameraStream = stream;
    const video = document.getElementById('scanVideo');
    video.srcObject = stream;
    // wait for video to actually have dimensions before starting scan loop
    video.onloadedmetadata = () => {
      video.play().then(() => {
        document.getElementById('scanHint').textContent = '📋 Hold QR card steady inside the frame';
        if (scanInterval) clearInterval(scanInterval);
        scanInterval = setInterval(scanFrame, 200);
      });
    };
    // fallback: some browsers don't fire onloadedmetadata reliably — poll instead
    setTimeout(() => {
      if (!scanInterval) {
        video.play().catch(() => {});
        if (scanInterval) clearInterval(scanInterval);
        scanInterval = setInterval(scanFrame, 200);
      }
    }, 1500);
  } catch (err) {
    alert('Camera error: ' + (err.message || 'Allow camera access and try again.'));
    closeScanner();
  }
}

function closeScanner() {
  stopCamera();
  showScreen('idle');
}

function stopCamera() {
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  const video = document.getElementById('scanVideo');
  if (video) { video.srcObject = null; video.onloadedmetadata = null; }
}

function scanFrame() {
  if (scanCooldown) return;

  const video  = document.getElementById('scanVideo');
  const canvas = document.getElementById('scanCanvas');
  if (!video || !canvas) return;

  // video must be playing and have real dimensions
  if (video.readyState < 2) return;
  if (!video.videoWidth || !video.videoHeight) return;
  if (video.paused || video.ended) return;

  // update hint once frames are actually processing
  const hint = document.getElementById('scanHint');
  if (hint && !hint.textContent.includes('Hold QR')) {
    hint.textContent = '📋 Hold QR card steady inside the frame';
  }

  try {
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth'
    });

    if (code && code.data && code.data.trim()) {
      scanCooldown = true;
      stopCamera();
      openStaffPicker();
    }
  } catch (e) {
    console.warn('scanFrame error:', e);
  }
}

// ════════════════════════════════════════════════
// STAFF PICKER — shown after any QR scan
// ════════════════════════════════════════════════
function openStaffPicker() {
  const search = document.getElementById('pickSearch');
  if (search) search.value = '';
  renderPickList();
  showScreen('pick');
}

function renderPickList() {
  const list    = document.getElementById('pickList');
  const query   = (document.getElementById('pickSearch')?.value || '').toLowerCase().trim();
  const staff   = getStaff();
  const today   = nowDateStr();
  const allLogs = getLogs();

  let filtered = staff;
  if (query) {
    filtered = staff.filter(s =>
      s.name.toLowerCase().includes(query) ||
      s.id.toLowerCase().includes(query) ||
      (s.dept || '').toLowerCase().includes(query)
    );
  }

  if (filtered.length === 0) {
    list.innerHTML = '<div class="pick-empty">' +
      (staff.length === 0
        ? '⚠️ No staff registered yet. Ask admin to add staff first.'
        : '😕 No match for "' + query + '"') +
      '</div>';
    return;
  }

  list.innerHTML = filtered.map(s => {
    const recs   = allLogs.filter(l => l.id === s.id && l.date === today);
    const hasIn  = recs.some(l => l.status === 'IN');
    const hasOut = recs.some(l => l.status === 'OUT');
    let badge, cls;
    if (hasIn && hasOut) { badge = 'Done ✓';        cls = 'done'; }
    else if (hasIn)       { badge = 'Signed In 🌅';  cls = 'in';   }
    else                  { badge = 'Not yet';        cls = 'none'; }
    return '<div class="pick-item" onclick="selectStaff(\'' + s.id + '\')">' +
      '<div class="pick-avatar">' + s.name.charAt(0).toUpperCase() + '</div>' +
      '<div class="pick-info">' +
        '<div class="pick-name">' + s.name + '</div>' +
        '<div class="pick-meta">' + s.role + ' · ' + s.dept + '</div>' +
      '</div>' +
      '<span class="pick-today ' + cls + '">' + badge + '</span>' +
    '</div>';
  }).join('');
}

function selectStaff(id) {
  const staff = getStaff().find(s => s.id === id);
  if (!staff) return;
  scanCooldown = false;
  processStaff(staff);
}

async function manualEntry() {
  stopCamera();
  openStaffPicker();
}

// ════════════════════════════════════════════════
// CORE LOGIC: Process selected staff
// ════════════════════════════════════════════════
let pendingStaff = null;

async function processStaff(staff) {
  const today   = nowDateStr();
  const shift   = getShift();
  const allLogs = getLogs();
  const todayRecords = allLogs.filter(l => l.id === staff.id && l.date === today);
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
          hashPin(setupBuffer, setupStaff.id).then(hashed => {
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
  const entered = await hashPin(pinBuffer, pendingStaff.id);

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
  postCloud('addLog', entry);

  // Lock this device for the session
  setDeviceSession(staffData);

  // Post to Google Sheets
  // Show success
  showSuccessScreen(staffData, entry, now);
  scanCooldown = false;
}

// ════════════════════════════════════════════════
// SUCCESS SCREEN
// ════════════════════════════════════════════════
let autoReturnTimer = null;

function showSuccessScreen(staff, entry, now) {
  const isIn = entry.status === 'IN';
  const screen = document.getElementById('screen-success');
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
// ════════════════════════════════════════════════
// INIT — cloud-first, with visible status
// ════════════════════════════════════════════════
async function init() {
  updateConnBar('loading', 'Connecting…');
  showLoading('Connecting to server…');

  if (!scriptUrl) {
    hideLoading();
    updateConnBar('disconnected', 'Not connected — tap to configure');
    // Show setup overlay so staff can enter the URL themselves
    openSetupOverlay();
    return;
  }

  const ok = await loadCloudData();
  hideLoading();

  if (ok) {
    const count = getStaff().length;
    const school = getSchool();
    document.getElementById('idleSchoolName').textContent = school.name || "Victory Montessori Int'l School";
    updateConnBar('connected', (count > 0 ? count + ' staff loaded · ' : '') + 'Connected');
    document.getElementById('idleSub').textContent =
      count > 0
        ? 'Hold your QR card up to the camera to record your attendance.'
        : 'Connected but no staff registered yet. Ask your admin to add staff.';
  } else {
    // Offline but has cached data
    const count = getStaff().length;
    if (count > 0) {
      updateConnBar('disconnected', 'Offline — using cached data (' + count + ' staff)');
    } else {
      updateConnBar('disconnected', 'No data — tap to reconfigure');
      openSetupOverlay();
    }
  }
}

// ── Connection bar helpers ──
function updateConnBar(state, text) {
  const bar = document.getElementById('connBar');
  const txt = document.getElementById('connBarText');
  if (!bar || !txt) return;
  bar.className = 'conn-bar ' + state;
  txt.textContent = text;
  // only clickable when disconnected
  bar.onclick = state === 'disconnected' ? openSetupOverlay : null;
  bar.style.cursor = state === 'disconnected' ? 'pointer' : 'default';
}

function showLoading(msg) {
  const el = document.getElementById('loadingOverlay');
  const txt = document.getElementById('loadingTxt');
  if (el) { el.classList.add('open'); }
  if (txt) txt.textContent = msg || 'Loading…';
}
function hideLoading() {
  const el = document.getElementById('loadingOverlay');
  if (el) el.classList.remove('open');
}

// ── Setup URL overlay ──
function openSetupOverlay() {
  const el = document.getElementById('setupOverlay');
  if (el) el.classList.add('open');
  const input = document.getElementById('setupUrlInput');
  if (input && scriptUrl) input.value = scriptUrl;
}
function dismissSetupOverlay() {
  const el = document.getElementById('setupOverlay');
  if (el) el.classList.remove('open');
}
async function saveSetupUrl() {
  const input = document.getElementById('setupUrlInput');
  const val = input ? input.value.trim() : '';
  if (!val || !val.startsWith('http')) {
    input.style.borderColor = 'red';
    setTimeout(() => { input.style.borderColor = ''; }, 1500);
    return;
  }
  scriptUrl = val;
  localStorage.setItem(STORAGE_KEYS.scriptUrl, scriptUrl);
  dismissSetupOverlay();
  // Re-run init with the new URL
  await init();
}

cleanDeviceSessions();
init();

// Prevent back gesture from closing the page on mobile
history.pushState(null, '', location.href);
window.addEventListener('popstate', () => {
  history.pushState(null, '', location.href);
});

// Prevent right-click / inspection on kiosk mode
document.addEventListener('contextmenu', e => e.preventDefault());

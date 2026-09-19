/* ============================================================
   ระบบจัดตารางงานพนักงานรายสัปดาห์
   app.js — Logic ทั้งหมด
   ============================================================ */

'use strict';

/* ============================================================
   1) CONSTANTS
   ============================================================ */
const LS_KEYS = {
  employees: 'wk_employees',
  shifts:    'wk_shifts',
  schedule:  'wk_schedule',
  layout:    'wk_layout'      // 'byEmp' | 'byShift'
};

const DAYS_TH   = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const DAYS_TH_S = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                   'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const DEFAULT_SHIFTS = [
  { id: 'S1', code: 'M',   name: 'เช้า',     startTime: '07:00', endTime: '16:00', color: '#f39c12', overnight: false, otUntil: null,    isOff: false },
  { id: 'S2', code: 'A',   name: 'บ่าย',     startTime: '13:30', endTime: '22:30', color: '#3498db', overnight: false, otUntil: null,    isOff: false },
  { id: 'S3', code: 'N',   name: 'ดึก',      startTime: '22:00', endTime: '07:00', color: '#8e44ad', overnight: true,  otUntil: '10:00', isOff: false },
  { id: 'S4', code: 'T08', name: '',         startTime: '08:00', endTime: '17:00', color: '#16a085', overnight: false, otUntil: null,    isOff: false },
  { id: 'S5', code: 'T10', name: '',         startTime: '10:00', endTime: '19:00', color: '#27ae60', overnight: false, otUntil: '22:30', isOff: false },
  { id: 'S6', code: 'T13', name: '',         startTime: '13:00', endTime: '22:00', color: '#2ecc71', overnight: false, otUntil: null,    isOff: false },
  { id: 'S7', code: 'MGR', name: 'ผู้จัดการ', startTime: '08:30', endTime: '17:30', color: '#c0392b', overnight: false, otUntil: null,    isOff: false },
  { id: 'S8', code: 'OFF', name: 'หยุด',     startTime: '',      endTime: '',      color: '#95a5a6', overnight: false, otUntil: null,    isOff: true  }
];

/* ============================================================
   2) STATE
   ============================================================ */
const STATE = {
  currentPage:  'schedule',
  currentView:  'week',           // day | week | month
  currentDate:  new Date(),
  layout:       'byEmp',          // byEmp | byShift
  employees:    [],
  shifts:       [],
  schedule:     {},               // { 'YYYY-MM-DD': { empId: { shiftId, ot } } }
  pendingAssign: { empId: null, date: null }
};

/* ============================================================
   3) UTILITIES
   ============================================================ */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function uid(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}
function pad2(n) { return String(n).padStart(2, '0'); }
function toISO(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function getMonday(date) {
  const d = startOfDay(date);
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}
function getWeekDates(date) {
  const mon = getMonday(date);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}
function getMonthDates(date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => new Date(y, m, i + 1));
}
function formatThaiDate(d) {
  return d.getDate() + ' ' + MONTHS_TH[d.getMonth()] + ' ' + (d.getFullYear() + 543);
}
function dayIndexMon(d) { return (d.getDay() + 6) % 7; }  // 0=จ. .. 6=อา.

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================================================
   4) TOAST
   ============================================================ */
let toastTimer = null;
function showToast(msg, type = 'info', duration = 2200) {
  const el = $('#toast');
  el.className = 'toast ' + (type === 'info' ? '' : type);
  el.textContent = msg;
  el.classList.remove('hidden');
  // Force reflow
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 250);
  }, duration);
}

/* ============================================================
   5) STORAGE
   ============================================================ */
function loadAll() {
  try {
    STATE.employees = JSON.parse(localStorage.getItem(LS_KEYS.employees) || '[]');
    STATE.schedule  = JSON.parse(localStorage.getItem(LS_KEYS.schedule)  || '{}');
    STATE.layout    = localStorage.getItem(LS_KEYS.layout) || 'byEmp';

    const rawShifts = localStorage.getItem(LS_KEYS.shifts);
    if (rawShifts == null) {
      STATE.shifts = JSON.parse(JSON.stringify(DEFAULT_SHIFTS));
      saveShifts();
    } else {
      STATE.shifts = JSON.parse(rawShifts);
    }
  } catch (err) {
    console.error('loadAll error', err);
    STATE.employees = [];
    STATE.shifts    = JSON.parse(JSON.stringify(DEFAULT_SHIFTS));
    STATE.schedule  = {};
    STATE.layout    = 'byEmp';
  }
}
function saveEmployees() { localStorage.setItem(LS_KEYS.employees, JSON.stringify(STATE.employees)); }
function saveShifts()    { localStorage.setItem(LS_KEYS.shifts,    JSON.stringify(STATE.shifts)); }
function saveSchedule()  { localStorage.setItem(LS_KEYS.schedule,  JSON.stringify(STATE.schedule)); }
function saveLayout()    { localStorage.setItem(LS_KEYS.layout,    STATE.layout); }

/* ============================================================
   6) MODAL HELPERS
   ============================================================ */
function openModal(id)  { $('#' + id).classList.remove('hidden'); }
function closeModal(id) { $('#' + id).classList.add('hidden'); }
function closeAllModals() {
  $$('.modal').forEach(m => m.classList.add('hidden'));
}

/* Confirm modal — Promise-based */
let confirmResolver = null;
function confirmDialog(msg) {
  return new Promise(resolve => {
    confirmResolver = resolve;
    $('#confirmMsg').textContent = msg;
    openModal('modalConfirm');
  });
}
$('#btnConfirmYes').addEventListener('click', () => {
  closeModal('modalConfirm');
  if (confirmResolver) { confirmResolver(true); confirmResolver = null; }
});
$('#btnConfirmNo').addEventListener('click', () => {
  closeModal('modalConfirm');
  if (confirmResolver) { confirmResolver(false); confirmResolver = null; }
});

/* ปุ่ม data-close ทั่วไป */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-close]');
  if (el) {
    e.preventDefault();
    closeModal(el.dataset.close);
  }
});

/* ============================================================
   7) PAGE NAVIGATION
   ============================================================ */
function switchPage(pageId) {
  STATE.currentPage = pageId;
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + pageId));
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));

  // ซ่อน toolbar บางหน้า (backup, ไม่ต้องใช้)
  const toolbar = $('#mainToolbar');
  const noToolbarPages = ['backup'];
  toolbar.style.display = noToolbarPages.includes(pageId) ? 'none' : '';

  // render ตามหน้า
  if (pageId === 'schedule') renderSchedule();
  if (pageId === 'history')  renderHistory();
  if (pageId === 'employees') renderEmployees();
  if (pageId === 'shifts')    renderShifts();
  if (pageId === 'summary')   renderSummary();
}

$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});

/* ============================================================
   8) TOOLBAR (View Mode + Date)
   ============================================================ */
$('#viewMode').addEventListener('change', (e) => {
  STATE.currentView = e.target.value;
  if (STATE.currentPage === 'history') renderHistory();
  else renderSchedule();
});

$('#btnPrev').addEventListener('click', () => shiftDate(-1));
$('#btnNext').addEventListener('click', () => shiftDate(+1));
$('#btnToday').addEventListener('click', () => {
  STATE.currentDate = new Date();
  if (STATE.currentPage === 'history') renderHistory();
  else renderSchedule();
});

$('#btnToggleLayout').addEventListener('click', () => {
  STATE.layout = STATE.layout === 'byEmp' ? 'byShift' : 'byEmp';
  saveLayout();
  if (STATE.currentPage === 'history') renderHistory();
  else renderSchedule();
  showToast(STATE.layout === 'byEmp' ? 'มุมมอง: แถว = พนักงาน' : 'มุมมอง: แถว = ผลัด');
});

function shiftDate(dir) {
  const d = new Date(STATE.currentDate);
  if (STATE.currentView === 'day')   d.setDate(d.getDate() + dir);
  if (STATE.currentView === 'week')  d.setDate(d.getDate() + 7 * dir);
  if (STATE.currentView === 'month') d.setMonth(d.getMonth() + dir);
  STATE.currentDate = d;
  if (STATE.currentPage === 'history') renderHistory();
  else renderSchedule();
}

/* ============================================================
   9) RENDER: SCHEDULE TABLE
   ============================================================ */
function getDateRange() {
  const view = STATE.currentView;
  const cur  = STATE.currentDate;
  if (view === 'day')   return [startOfDay(cur)];
  if (view === 'week')  return getWeekDates(cur);
  return getMonthDates(cur);
}

function getDateLabel() {
  const view = STATE.currentView;
  const cur  = STATE.currentDate;
  if (view === 'day') {
    return DAYS_TH[dayIndexMon(cur)] + ' ' + formatThaiDate(cur);
  }
  if (view === 'week') {
    const days = getWeekDates(cur);
    const a = days[0], b = days[6];
    return a.getDate() + ' ' + MONTHS_TH[a.getMonth()] + ' – ' +
           b.getDate() + ' ' + MONTHS_TH[b.getMonth()];
  }
  return MONTHS_TH[cur.getMonth()] + ' ' + (cur.getFullYear() + 543);
}

function renderSchedule() {
  const wrapper = $('#scheduleWrapper');
  const dates   = getDateRange();
  $('#dateLabel').textContent = getDateLabel();

  if (STATE.employees.length === 0 && STATE.layout === 'byEmp') {
    wrapper.innerHTML = '<div class="empty-state">ยังไม่มีพนักงาน — กรุณาเพิ่มที่เมนู "พนักงาน"</div>';
    return;
  }
  if (STATE.shifts.length === 0 && STATE.layout === 'byShift') {
    wrapper.innerHTML = '<div class="empty-state">ยังไม่มีผลัด — กรุณาเพิ่มที่เมนู "ผลัด"</div>';
    return;
  }

  const html = STATE.layout === 'byEmp'
    ? buildTableByEmployee(dates)
    : buildTableByShift(dates);

  wrapper.innerHTML = html;

  // bind click cells
  $$('table.schedule td.cell', wrapper).forEach(td => {
    td.addEventListener('click', () => {
      openAssignModal(td.dataset.emp, td.dataset.date);
    });
  });
}

/* ---------- ตารางแบบแถว = พนักงาน ---------- */
function buildTableByEmployee(dates) {
  let thead = '<thead><tr><th class="emp-col">พนักงาน</th>';
  dates.forEach(d => {
    thead += '<th>' + DAYS_TH_S[dayIndexMon(d)] +
             '<small>' + d.getDate() + '/' + (d.getMonth() + 1) + '</small></th>';
  });
  thead += '</tr></thead>';

  let tbody = '<tbody>';
  STATE.employees.forEach(emp => {
    tbody += '<tr>';
    tbody += '<td class="emp-col">' +
             '<strong>' + escapeHtml(emp.fullname) + '</strong>' +
             '<small>' + escapeHtml(emp.position || '') +
             (emp.code ? ' • ' + escapeHtml(emp.code) : '') + '</small>' +
             '</td>';

    dates.forEach(d => {
      const iso = toISO(d);
      const entry = STATE.schedule[iso]?.[emp.id];
      const shift = entry ? STATE.shifts.find(s => s.id === entry.shiftId) : null;

      let inner = '<span style="color:#ccc;">–</span>';
      if (shift) {
        const otClass = entry.ot ? ' ot' : '';
        inner = '<span class="shift-chip' + otClass + '" style="background:' +
                shift.color + '">' + escapeHtml(shift.code || shift.name || '?') + '</span>';
      }
      tbody += '<td class="cell" data-emp="' + emp.id + '" data-date="' + iso + '">' + inner + '</td>';
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  return '<table class="schedule">' + thead + tbody + '</table>';
}

/* ---------- ตารางแบบแถว = ผลัด ---------- */
function buildTableByShift(dates) {
  let thead = '<thead><tr><th class="emp-col">ผลัด</th>';
  dates.forEach(d => {
    thead += '<th>' + DAYS_TH_S[dayIndexMon(d)] +
             '<small>' + d.getDate() + '/' + (d.getMonth() + 1) + '</small></th>';
  });
  thead += '</tr></thead>';

  let tbody = '<tbody>';
  STATE.shifts.forEach(shift => {
    tbody += '<tr>';
    tbody += '<td class="emp-col">' +
             '<strong><span class="shift-chip" style="background:' + shift.color + '">' +
             escapeHtml(shift.code) + '</span> ' + escapeHtml(shift.name) + '</strong>' +
             '<small>' + (shift.startTime || '') +
             (shift.endTime ? '–' + shift.endTime : '') +
             (shift.overnight ? ' (ข้ามวัน)' : '') + '</small>' +
             '</td>';

    dates.forEach(d => {
      const iso = toISO(d);
      const daySched = STATE.schedule[iso] || {};
      const names = STATE.employees
        .filter(e => daySched[e.id]?.shiftId === shift.id)
        .map(e => {
          const ot = daySched[e.id].ot ? ' +OT' : '';
          return escapeHtml(e.fullname) + ot;
        });

      const cell = names.length
        ? '<div style="font-size:11px;line-height:1.5;text-align:left;">' + names.join('<br>') + '</div>'
        : '<span style="color:#ccc;">–</span>';

      tbody += '<td class="cell" data-shift="' + shift.id + '" data-date="' + iso +
               '" style="cursor:default;">' + cell + '</td>';
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  return '<table class="schedule">' + thead + tbody + '</table>';
}

/* ============================================================
   10) RENDER: HISTORY (เหมือน schedule แต่ใช้ viewMode อิสระ)
   ============================================================ */
function renderHistory() {
  // ใช้ logic เดียวกับ schedule
  const wrapper = $('#historyWrapper');
  const dates   = getDateRange();
  $('#dateLabel').textContent = getDateLabel();

  if (STATE.employees.length === 0 && STATE.layout === 'byEmp') {
    wrapper.innerHTML = '<div class="empty-state">ยังไม่มีพนักงาน</div>';
    return;
  }

  const html = STATE.layout === 'byEmp'
    ? buildTableByEmployee(dates)
    : buildTableByShift(dates);

  wrapper.innerHTML = html;

  $$('table.schedule td.cell', wrapper).forEach(td => {
    td.addEventListener('click', () => {
      openAssignModal(td.dataset.emp, td.dataset.date);
    });
  });
}

/* ============================================================
   11) MODAL: ASSIGN SHIFT
   ============================================================ */
function openAssignModal(empId, date) {
  const emp = STATE.employees.find(e => e.id === empId);
  if (!emp) return;

  STATE.pendingAssign = { empId, date };

  const current = STATE.schedule[date]?.[empId] || null;

  $('#assignTitle').textContent = emp.fullname + ' • ' + date;

  // สร้าง radio list
  let html = '';
  html += '<label>' +
          '<input type="radio" name="assignShift" value=""' +
          (!current ? ' checked' : '') + '>' +
          '<span class="label-text">ไม่ทำงาน</span>' +
          '</label>';

  STATE.shifts.forEach(s => {
    const checked = current && current.shiftId === s.id ? ' checked' : '';
    const timeText = s.isOff
      ? ''
      : (s.startTime && s.endTime ? ' (' + s.startTime + '–' + s.endTime + ')' : '');
    html += '<label>' +
            '<input type="radio" name="assignShift" value="' + s.id + '"' + checked + '>' +
            '<span class="shift-chip" style="background:' + s.color + '">' +
            escapeHtml(s.code) + '</span>' +
            '<span class="label-text">' + escapeHtml(s.name || s.code) +
            '<span class="label-time">' + timeText + '</span></span>' +
            '</label>';
  });

  $('#assignBody').innerHTML = html;

  // OT checkbox
  const otWrap = $('#assignOtWrap');
  const otCheck = $('#assignOtCheck');
  const otTime = $('#assignOtTime');
  otWrap.classList.add('hidden');
  otCheck.checked = false;

  function updateOt() {
    const sel = $('input[name="assignShift"]:checked');
    if (!sel || !sel.value) {
      otWrap.classList.add('hidden');
      return;
    }
    const shift = STATE.shifts.find(s => s.id === sel.value);
    if (shift && shift.otUntil) {
      otWrap.classList.remove('hidden');
      otTime.textContent = shift.otUntil;
      otCheck.checked = current && current.shiftId === shift.id ? !!current.ot : false;
    } else {
      otWrap.classList.add('hidden');
      otCheck.checked = false;
    }
  }

  $$('input[name="assignShift"]').forEach(r => {
    r.addEventListener('change', updateOt);
  });
  updateOt();

  openModal('modalAssign');
}

/* บันทึก assign */
$('#btnSaveAssign').addEventListener('click', () => {
  const { empId, date } = STATE.pendingAssign;
  if (!empId || !date) return;

  const sel = $('input[name="assignShift"]:checked');
  const val = sel ? sel.value : '';

  if (!STATE.schedule[date]) STATE.schedule[date] = {};

  if (!val) {
    delete STATE.schedule[date][empId];
    if (Object.keys(STATE.schedule[date]).length === 0) {
      delete STATE.schedule[date];
    }
  } else {
    STATE.schedule[date][empId] = {
      shiftId: val,
      ot: $('#assignOtCheck').checked === true && !$('#assignOtWrap').classList.contains('hidden')
    };
  }
  saveSchedule();
  closeModal('modalAssign');
  if (STATE.currentPage === 'history') renderHistory();
  else renderSchedule();
  showToast('บันทึกเรียบร้อย', 'success');
});

/* คัดลอกจากเมื่อวาน */
$('#btnCopyYesterday').addEventListener('click', () => {
  const { empId, date } = STATE.pendingAssign;
  if (!empId || !date) return;

  const yesterday = toISO(addDays(fromISO(date), -1));
  const prev = STATE.schedule[yesterday]?.[empId];

  if (!prev) {
    showToast('เมื่อวานไม่มีข้อมูล', 'warn');
    return;
  }
  const shift = STATE.shifts.find(s => s.id === prev.shiftId);
  if (!shift) {
    showToast('ผลัดของเมื่อวานถูกลบไปแล้ว', 'error');
    return;
  }

  // ติ๊ก radio
  const target = $('input[name="assignShift"][value="' + prev.shiftId + '"]');
  if (target) {
    target.checked = true;
    target.dispatchEvent(new Event('change'));
    if (prev.ot && shift.otUntil) {
      $('#assignOtCheck').checked = true;
    }
    showToast('คัดลอกจากเมื่อวานแล้ว', 'success');
  }
});

/* ============================================================
   12) EMPLOYEE CRUD
   ============================================================ */
function renderEmployees() {
  const box = $('#employeeList');
  if (STATE.employees.length === 0) {
    box.innerHTML = '<div class="empty-state">ยังไม่มีพนักงาน — กดปุ่มด้านบนเพื่อเพิ่ม</div>';
    return;
  }
  box.innerHTML = STATE.employees.map(e => {
    const code = e.code ? ' <small>(' + escapeHtml(e.code) + ')</small>' : '';
    return '<div class="card">' +
           '<div class="info">' +
             '<strong>' + escapeHtml(e.fullname) + code + '</strong>' +
             '<small>' + escapeHtml(e.position || '-') + ' • ' + escapeHtml(e.phone || '-') + '</small>' +
           '</div>' +
           '<div class="actions">' +
             '<button data-edit="' + e.id + '" title="แก้ไข">✏️</button>' +
             '<button data-del="' + e.id + '" title="ลบ">🗑️</button>' +
           '</div>' +
           '</div>';
  }).join('');

  $$('[data-edit]', box).forEach(b => {
    b.addEventListener('click', () => openEmployeeModal(b.dataset.edit));
  });
  $$('[data-del]', box).forEach(b => {
    b.addEventListener('click', () => deleteEmployee(b.dataset.del));
  });
}

function openEmployeeModal(id) {
  const form = $('#employeeForm');
  form.reset();
  if (id) {
    const e = STATE.employees.find(x => x.id === id);
    if (!e) return;
    form.id.value = e.id;
    form.code.value = e.code || '';
    form.fullname.value = e.fullname;
    form.position.value = e.position;
    form.phone.value = e.phone;
    $('#empModalTitle').textContent = 'แก้ไขพนักงาน';
  } else {
    form.id.value = '';
    $('#empModalTitle').textContent = 'เพิ่มพนักงาน';
  }
  openModal('modalEmployee');
  setTimeout(() => form.fullname.focus(), 100);
}

$('#btnAddEmployee').addEventListener('click', () => openEmployeeModal(null));

$('#employeeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const data = {
    id: f.id.value || uid('emp'),
    code: f.code.value.trim(),
    fullname: f.fullname.value.trim(),
    position: f.position.value.trim(),
    phone: f.phone.value.trim()
  };
  if (!data.fullname || !data.position || !data.phone) {
    showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
    return;
  }
  const idx = STATE.employees.findIndex(x => x.id === data.id);
  if (idx >= 0) {
    STATE.employees[idx] = data;
  } else {
    STATE.employees.push(data);
  }
  saveEmployees();
  closeModal('modalEmployee');
  renderEmployees();
  showToast(idx >= 0 ? 'แก้ไขเรียบร้อย' : 'เพิ่มพนักงานเรียบร้อย', 'success');
});

async function deleteEmployee(id) {
  const e = STATE.employees.find(x => x.id === id);
  if (!e) return;

  const ok = await confirmDialog('ลบพนักงาน "' + e.fullname + '" และตารางงานที่เกี่ยวข้องทั้งหมด?');
  if (!ok) return;

  STATE.employees = STATE.employees.filter(x => x.id !== id);
  Object.keys(STATE.schedule).forEach(date => {
    if (STATE.schedule[date][id]) {
      delete STATE.schedule[date][id];
      if (Object.keys(STATE.schedule[date]).length === 0) delete STATE.schedule[date];
    }
  });
  saveEmployees();
  saveSchedule();
  renderEmployees();
  showToast('ลบพนักงานเรียบร้อย', 'success');
}

/* ============================================================
   13) SHIFT CRUD
   ============================================================ */
function renderShifts() {
  const box = $('#shiftList');
  if (STATE.shifts.length === 0) {
    box.innerHTML = '<div class="empty-state">ยังไม่มีผลัด — กดปุ่มด้านบนเพื่อเพิ่ม</div>';
    return;
  }
  box.innerHTML = STATE.shifts.map(s => {
    const time = s.isOff
      ? 'วันหยุด'
      : (s.startTime || '?') + ' – ' + (s.endTime || '?') +
        (s.overnight ? ' (ข้ามวัน)' : '') +
        (s.otUntil ? ' • OT ถึง ' + s.otUntil : '');
    return '<div class="card" style="border-left-color:' + s.color + ';">' +
           '<div class="info">' +
             '<strong>' +
               '<span class="shift-chip" style="background:' + s.color + '">' +
                 escapeHtml(s.code) + '</span> ' +
               escapeHtml(s.name || '') +
             '</strong>' +
             '<small>' + time + '</small>' +
           '</div>' +
           '<div class="actions">' +
             '<button data-edit="' + s.id + '" title="แก้ไข">✏️</button>' +
             '<button data-del="' + s.id + '" title="ลบ">🗑️</button>' +
           '</div>' +
           '</div>';
  }).join('');

  $$('[data-edit]', box).forEach(b => {
    b.addEventListener('click', () => openShiftModal(b.dataset.edit));
  });
  $$('[data-del]', box).forEach(b => {
    b.addEventListener('click', () => deleteShift(b.dataset.del));
  });
}

function openShiftModal(id) {
  const form = $('#shiftForm');
  form.reset();
  if (id) {
    const s = STATE.shifts.find(x => x.id === id);
    if (!s) return;
    form.id.value = s.id;
    form.code.value = s.code || '';
    form.name.value = s.name || '';
    form.startTime.value = s.startTime || '';
    form.endTime.value = s.endTime || '';
    form.otUntil.value = s.otUntil || '';
    form.color.value = s.color || '#3498db';
    form.overnight.checked = !!s.overnight;
    form.isOff.checked = !!s.isOff;
    $('#shiftModalTitle').textContent = 'แก้ไขผลัด';
  } else {
    form.id.value = '';
    form.code.value = '';
    form.name.value = '';
    form.startTime.value = '';
    form.endTime.value = '';
    form.otUntil.value = '';
    form.color.value = '#3498db';
    form.overnight.checked = false;
    form.isOff.checked = false;
    $('#shiftModalTitle').textContent = 'เพิ่มผลัด';
  }
  updateShiftPreview();
  openModal('modalShift');
  setTimeout(() => form.code.focus(), 100);
}

function updateShiftPreview() {
  const form = $('#shiftForm');
  const chip = $('#shiftPreviewChip');
  chip.textContent = form.code.value || '?';
  chip.style.background = form.color.value || '#3498db';
}

$('#btnAddShift').addEventListener('click', () => openShiftModal(null));

/* preview สี/รหัส แบบ live */
$('#shiftForm').addEventListener('input', (e) => {
  if (e.target.name === 'code' || e.target.name === 'color') {
    updateShiftPreview();
  }
});

$('#shiftForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const data = {
    id: f.id.value || uid('shift'),
    code: f.code.value.trim(),
    name: f.name.value.trim(),
    startTime: f.startTime.value || '',
    endTime: f.endTime.value || '',
    otUntil: f.otUntil.value || null,
    color: f.color.value || '#3498db',
    overnight: !!f.overnight.checked,
    isOff: !!f.isOff.checked
  };
  if (!data.code) {
    showToast('กรุณากรอกรหัสผลัด', 'error');
    return;
  }
  const idx = STATE.shifts.findIndex(x => x.id === data.id);
  if (idx >= 0) {
    STATE.shifts[idx] = data;
  } else {
    STATE.shifts.push(data);
  }
  saveShifts();
  closeModal('modalShift');
  renderShifts();
  showToast(idx >= 0 ? 'แก้ไขเรียบร้อย' : 'เพิ่มผลัดเรียบร้อย', 'success');
});

async function deleteShift(id) {
  const s = STATE.shifts.find(x => x.id === id);
  if (!s) return;

  const ok = await confirmDialog('ลบผลัด "' + (s.name || s.code) + '"?\nตารางงานที่ใช้ผลัดนี้จะถูกลบออกด้วย');
  if (!ok) return;

  STATE.shifts = STATE.shifts.filter(x => x.id !== id);
  Object.keys(STATE.schedule).forEach(date => {
    const day = STATE.schedule[date];
    Object.keys(day).forEach(empId => {
      if (day[empId].shiftId === id) {
        delete day[empId];
      }
    });
    if (Object.keys(day).length === 0) delete STATE.schedule[date];
  });
  saveShifts();
  saveSchedule();
  renderShifts();
  showToast('ลบผลัดเรียบร้อย', 'success');
}

/* ============================================================
   14) SUMMARY
   ============================================================ */
function renderSummary() {
  const dateInput = $('#summaryDate');
  if (!dateInput.value) {
    dateInput.value = toISO(new Date());
  }
  const dateStr = dateInput.value;
  const dateObj = fromISO(dateStr);
  const daySched = STATE.schedule[dateStr] || {};

  let html = '<h3>' + DAYS_TH[dayIndexMon(dateObj)] + ' ' + formatThaiDate(dateObj) + '</h3>';

  STATE.shifts.forEach(s => {
    const list = STATE.employees.filter(e => daySched[e.id]?.shiftId === s.id);
    const names = list.map(e => {
      const ot = daySched[e.id].ot ? ' <span style="color:#f39c12;font-weight:700;">+OT</span>' : '';
      return escapeHtml(e.fullname) + ot;
    });
    html += '<div class="card" style="border-left-color:' + s.color + ';display:block;">' +
              '<strong>' +
                '<span class="shift-chip" style="background:' + s.color + '">' +
                  escapeHtml(s.code) + '</span> ' +
                escapeHtml(s.name || s.code) +
                ' — ' + list.length + ' คน' +
              '</strong>' +
              '<div class="names">' +
                (names.length ? names.join(', ') : '<span style="color:#aaa;">— ไม่มีพนักงาน —</span>') +
              '</div>' +
            '</div>';
  });

  const workingShiftIds = STATE.shifts.filter(s => !s.isOff).map(s => s.id);
  const workingCount = Object.values(daySched)
    .filter(v => workingShiftIds.includes(v.shiftId)).length;

  html += '<div class="summary-total">รวมพนักงานทำงาน ' +
          workingCount + ' / ' + STATE.employees.length + ' คน</div>';

  $('#summaryContent').innerHTML = html;
}

$('#btnLoadSummary').addEventListener('click', renderSummary);
$('#summaryDate').addEventListener('change', renderSummary);

/* ============================================================
   15) BACKUP: EXPORT
   ============================================================ */
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function timestampName() {
  const d = new Date();
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
         '_' + pad2(d.getHours()) + pad2(d.getMinutes());
}

$$('[data-export]').forEach(btn => {
  btn.addEventListener('click', () => exportData(btn.dataset.export));
});

function exportData(format) {
  const data = {
    employees: STATE.employees,
    shifts:    STATE.shifts,
    schedule:  STATE.schedule,
    exportedAt: new Date().toISOString(),
    version: 1
  };

  if (format === 'json') {
    downloadFile(
      'schedule_backup_' + timestampName() + '.json',
      JSON.stringify(data, null, 2),
      'application/json;charset=utf-8'
    );
    showToast('Export JSON สำเร็จ', 'success');
    return;
  }

  if (format === 'csv') {
    const rows = [[
      'date', 'employee_code', 'employee_name', 'position', 'phone',
      'shift_code', 'shift_name', 'start', 'end', 'ot'
    ]];
    Object.keys(STATE.schedule).sort().forEach(date => {
      const day = STATE.schedule[date];
      Object.keys(day).forEach(empId => {
        const emp = STATE.employees.find(e => e.id === empId);
        const sh  = STATE.shifts.find(s => s.id === day[empId].shiftId);
        if (!emp || !sh) return;
        rows.push([
          date,
          emp.code || '',
          emp.fullname,
          emp.position || '',
          emp.phone || '',
          sh.code,
          sh.name || '',
          sh.startTime || '',
          sh.endTime || '',
          day[empId].ot ? 'TRUE' : 'FALSE'
        ]);
      });
    });
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    // ใส่ BOM ให้ Excel อ่านภาษาไทยถูก
    downloadFile(
      'schedule_backup_' + timestampName() + '.csv',
      '\uFEFF' + csv,
      'text/csv;charset=utf-8'
    );
    showToast('Export CSV สำเร็จ', 'success');
    return;
  }

  if (format === 'xlsx') {
    if (typeof XLSX === 'undefined') {
      showToast('ไลบรารี Excel ยังโหลดไม่เสร็จ กรุณาลองใหม่', 'error');
      return;
    }
    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.json_to_sheet(STATE.employees);
    XLSX.utils.book_append_sheet(wb, ws1, 'Employees');

    const ws2 = XLSX.utils.json_to_sheet(STATE.shifts);
    XLSX.utils.book_append_sheet(wb, ws2, 'Shifts');

    const schedRows = [];
    Object.keys(STATE.schedule).sort().forEach(date => {
      const day = STATE.schedule[date];
      Object.keys(day).forEach(empId => {
        const emp = STATE.employees.find(e => e.id === empId);
        const sh  = STATE.shifts.find(s => s.id === day[empId].shiftId);
        if (!emp || !sh) return;
        schedRows.push({
          date: date,
          employee_code: emp.code || '',
          employee_name: emp.fullname,
          position: emp.position || '',
          phone: emp.phone || '',
          shift_code: sh.code,
          shift_name: sh.name || '',
          start: sh.startTime || '',
          end: sh.endTime || '',
          ot: day[empId].ot ? 'TRUE' : 'FALSE'
        });
      });
    });
    const ws3 = XLSX.utils.json_to_sheet(schedRows.length ? schedRows : [{ date: '' }]);
    XLSX.utils.book_append_sheet(wb, ws3, 'Schedule');

    XLSX.writeFile(wb, 'schedule_backup_' + timestampName() + '.xlsx');
    showToast('Export Excel สำเร็จ', 'success');
    return;
  }
}

/* ============================================================
   16) BACKUP: IMPORT
   ============================================================ */
$('#btnImport').addEventListener('click', () => $('#importFile').click());

$('#importFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const status = $('#importStatus');
  status.className = 'import-status';
  status.textContent = 'กำลังอ่านไฟล์...';

  const reader = new FileReader();

  reader.onload = async (ev) => {
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith('.json')) {
        importJSON(ev.target.result);
      } else if (name.endsWith('.csv')) {
        importCSV(ev.target.result);
      } else if (name.endsWith('.xlsx')) {
        importXLSX(ev.target.result);
      } else {
        throw new Error('ไม่รองรับไฟล์ประเภทนี้');
      }
      status.className = 'import-status success';
      status.textContent = '✓ นำเข้าข้อมูลสำเร็จ';
      showToast('นำเข้าข้อมูลสำเร็จ', 'success');
      renderEmployees();
      renderShifts();
      renderSchedule();
    } catch (err) {
      console.error(err);
      status.className = 'import-status error';
      status.textContent = '✗ ผิดพลาด: ' + err.message;
      showToast('นำเข้าล้มเหลว: ' + err.message, 'error', 3000);
    } finally {
      e.target.value = '';   // reset ให้เลือกไฟล์เดิมซ้ำได้
    }
  };

  reader.onerror = () => {
    status.className = 'import-status error';
    status.textContent = '✗ อ่านไฟล์ไม่ได้';
  };

  if (file.name.toLowerCase().endsWith('.xlsx')) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file, 'UTF-8');
  }
});

function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
  if (!Array.isArray(data.employees)) throw new Error('ไม่พบข้อมูล employees');
  if (!Array.isArray(data.shifts))    throw new Error('ไม่พบข้อมูล shifts');

  STATE.employees = data.employees;
  STATE.shifts    = data.shifts;
  STATE.schedule  = data.schedule && typeof data.schedule === 'object' ? data.schedule : {};

  saveEmployees();
  saveShifts();
  saveSchedule();
}

function importCSV(text) {
  // ลบ BOM
  text = text.replace(/^\uFEFF/, '');

  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) throw new Error('ไฟล์ว่างเปล่า');

  const header = parseCSVLine(lines[0]);
  const idx = (name) => header.indexOf(name);

  const colDate = idx('date');
  const colEmpCode = idx('employee_code');
  const colEmpName = idx('employee_name');
  const colPos = idx('position');
  const colPhone = idx('phone');
  const colShiftCode = idx('shift_code');
  const colShiftName = idx('shift_name');
  const colStart = idx('start');
  const colEnd = idx('end');
  const colOt = idx('ot');

  if (colDate < 0 || colEmpName < 0 || colShiftCode < 0) {
    throw new Error('CSV ไม่มีคอลัมน์ที่จำเป็น (date, employee_name, shift_code)');
  }

  // reset ก่อน import
  STATE.employees = [];
  STATE.shifts = [];
  STATE.schedule = {};

  const empMap = {};    // key -> empId
  const shiftMap = {};  // code -> shiftId

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (!cols.length) continue;

    const date = (cols[colDate] || '').trim();
    const empCode = colEmpCode >= 0 ? (cols[colEmpCode] || '').trim() : '';
    const empName = (cols[colEmpName] || '').trim();
    const pos = colPos >= 0 ? (cols[colPos] || '').trim() : '';
    const phone = colPhone >= 0 ? (cols[colPhone] || '').trim() : '';
    const shCode = (cols[colShiftCode] || '').trim();
    const shName = colShiftName >= 0 ? (cols[colShiftName] || '').trim() : '';
    const shStart = colStart >= 0 ? (cols[colStart] || '').trim() : '';
    const shEnd = colEnd >= 0 ? (cols[colEnd] || '').trim() : '';
    const ot = colOt >= 0 ? ((cols[colOt] || '').toUpperCase() === 'TRUE') : false;

    if (!date || !empName || !shCode) continue;

    // employee
    const empKey = empCode || empName;
    let empId = empMap[empKey];
    if (!empId) {
      empId = uid('emp');
      empMap[empKey] = empId;
      STATE.employees.push({
        id: empId, code: empCode, fullname: empName,
        position: pos, phone: phone
      });
    }

    // shift
    let shId = shiftMap[shCode];
    if (!shId) {
      shId = uid('shift');
      shiftMap[shCode] = shId;
      STATE.shifts.push({
        id: shId, code: shCode, name: shName,
        startTime: shStart, endTime: shEnd,
        color: pickColorForCode(shCode),
        overnight: shStart && shEnd ? (shEnd <= shStart) : false,
        otUntil: null,
        isOff: shCode.toUpperCase() === 'OFF'
      });
    }

    // schedule
    if (!STATE.schedule[date]) STATE.schedule[date] = {};
    STATE.schedule[date][empId] = { shiftId: shId, ot: ot };
  }

  saveEmployees();
  saveShifts();
  saveSchedule();
}

/* แปลง CSV line → array (รองรับ quote + escaped quote) */
function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/* สุ่มสีตาม code (ใช้ตอน import CSV ที่ไม่มีสี) */
function pickColorForCode(code) {
  const palette = ['#f39c12', '#3498db', '#8e44ad', '#16a085', '#27ae60',
                   '#2ecc71', '#c0392b', '#95a5a6', '#e67e22', '#1abc9c'];
  let sum = 0;
  for (let i = 0; i < code.length; i++) sum += code.charCodeAt(i);
  return palette[sum % palette.length];
}

function importXLSX(arrayBuffer) {
  if (typeof XLSX === 'undefined') throw new Error('ไลบรารี Excel ยังไม่พร้อม');

  const wb = XLSX.read(arrayBuffer, { type: 'array' });

  const sheetEmp = wb.Sheets['Employees'] || wb.Sheets[wb.SheetNames[0]];
  const sheetShf = wb.Sheets['Shifts'];
  const sheetSch = wb.Sheets['Schedule'];

  if (!sheetEmp) throw new Error('ไม่พบ sheet Employees');

  const employees = XLSX.utils.sheet_to_json(sheetEmp, { defval: '' });
  const shifts    = sheetShf ? XLSX.utils.sheet_to_json(sheetShf, { defval: '' }) : [];
  const sched     = sheetSch ? XLSX.utils.sheet_to_json(sheetSch, { defval: '' }) : [];

  STATE.employees = employees.map(e => ({
    id: e.id || uid('emp'),
    code: e.code || '',
    fullname: e.fullname || e.name || '',
    position: e.position || '',
    phone: String(e.phone || '')
  })).filter(e => e.fullname);

  STATE.shifts = shifts.map(s => ({
    id: s.id || uid('shift'),
    code: s.code || '',
    name: s.name || '',
    startTime: s.startTime || '',
    endTime: s.endTime || '',
    color: s.color || pickColorForCode(s.code || '?'),
    overnight: !!s.overnight,
    otUntil: s.otUntil || null,
    isOff: !!s.isOff
  })).filter(s => s.code);

  if (STATE.shifts.length === 0) {
    STATE.shifts = JSON.parse(JSON.stringify(DEFAULT_SHIFTS));
  }

  const empByCode = {};
  const empByName = {};
  STATE.employees.forEach(e => {
    if (e.code) empByCode[e.code] = e.id;
    empByName[e.fullname] = e.id;
  });
  const shiftByCode = {};
  STATE.shifts.forEach(s => { shiftByCode[s.code] = s.id; });

  STATE.schedule = {};
  sched.forEach(row => {
    const date = row.date;
    if (!date) return;
    const empId = empByCode[row.employee_code] || empByName[row.employee_name];
    const shId = shiftByCode[row.shift_code];
    if (!empId || !shId) return;
    if (!STATE.schedule[date]) STATE.schedule[date] = {};
    STATE.schedule[date][empId] = {
      shiftId: shId,
      ot: String(row.ot).toUpperCase() === 'TRUE'
    };
  });

  saveEmployees();
  saveShifts();
  saveSchedule();
}

/* ============================================================
   17) RESET ALL
   ============================================================ */
$('#btnResetAll').addEventListener('click', async () => {
  const ok = await confirmDialog('ล้างข้อมูลทั้งหมด?\nพนักงาน ผลัด และตารางงานจะหายถาวร');
  if (!ok) return;
  localStorage.removeItem(LS_KEYS.employees);
  localStorage.removeItem(LS_KEYS.shifts);
  localStorage.removeItem(LS_KEYS.schedule);
  localStorage.removeItem(LS_KEYS.layout);
  loadAll();
  renderEmployees();
  renderShifts();
  renderSchedule();
  showToast('ล้างข้อมูลเรียบร้อย', 'success');
});

/* ============================================================
   18) INIT
   ============================================================ */
function init() {
  loadAll();

  // set summary date = วันนี้
  $('#summaryDate').value = toISO(new Date());

  // render หน้าแรก
  switchPage('schedule');

  // hotkey: ESC ปิด modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });

  console.log('%c📋 ระบบจัดตารางงานพร้อมใช้งาน', 'color:#3498db;font-weight:bold;font-size:14px;');
}

document.addEventListener('DOMContentLoaded', init);

/* =====================================================================
 * ระบบจัดตารางงานพนักงานรายสัปดาห์
 * HTML5 + CSS + Vanilla JS (ไม่ใช้ framework) — ใช้ CDN เฉพาะ SheetJS
 *
 * โครงสร้างไฟล์:
 *   1. Constants & State
 *   2. Utilities
 *   3. Storage (load/save)
 *   4. Page Navigation
 *   5. Toolbar / View Mode
 *   6. Render Schedule (2 มุมมอง)
 *   7. Assign Modal
 *   8. Employee CRUD
 *   9. Shift CRUD
 *  10. Summary (และหน้าย้อนหลัง)
 *  11. Backup (Import/Export)
 *  12. Init
 * ===================================================================== */
'use strict';


/* =====================================================================
 * 1. Constants & State
 *    ค่าคงที่ของแอป และ state กลางที่ทุกส่วนใช้ร่วมกัน
 * ===================================================================== */

// คีย์ที่ใช้เก็บข้อมูลใน localStorage
const LS_EMPLOYEES = 'wk_employees';
const LS_SHIFTS = 'wk_shifts';
const LS_SCHEDULE = 'wk_schedule';

// ชื่อวัน/เดือนภาษาไทย
const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const THAI_DAYS_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];
const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

// ผลัดเริ่มต้น (ใส่ครั้งแรกถ้า localStorage ว่าง)
const DEFAULT_SHIFT_SEED = [
  { code: 'M',   name: 'เช้า',       start: '07:00', end: '16:00', color: '#f39c12', overnight: false, otUntil: null },
  { code: 'A',   name: 'บ่าย',       start: '13:30', end: '22:30', color: '#3498db', overnight: false, otUntil: null },
  { code: 'N',   name: 'ดึก',        start: '22:00', end: '07:00', color: '#8e44ad', overnight: true,  otUntil: '10:00' },
  { code: 'T08', name: '',           start: '08:00', end: '17:00', color: '#16a085', overnight: false, otUntil: null },
  { code: 'T10', name: '',           start: '10:00', end: '19:00', color: '#27ae60', overnight: false, otUntil: '22:30' },
  { code: 'T13', name: '',           start: '13:00', end: '22:00', color: '#2ecc71', overnight: false, otUntil: null },
  { code: 'MGR', name: 'ผู้จัดการ',   start: '08:30', end: '17:30', color: '#c0392b', overnight: false, otUntil: null },
  { code: 'OFF', name: 'หยุด',       start: '',      end: '',      color: '#95a5a6', overnight: false, otUntil: null, isOff: true }
];

// สีสำรองสำหรับผลัดที่ถูกสร้างอัตโนมัติตอนนำเข้าข้อมูล
const IMPORT_COLOR_PALETTE = [
  '#1abc9c', '#e67e22', '#e84393', '#0984e3', '#6c5ce7',
  '#00b894', '#d63031', '#b8860b', '#636e72'
];

const DEFAULT_SHIFT_COLOR = '#3498db';

// state กลางของแอป
const state = {
  employees: [],            // [{ id, code, fullname, position, phone }]
  shifts: [],               // [{ id, code, name, startTime, endTime, color, overnight, otUntil, isOff }]
  schedule: {},             // { "YYYY-MM-DD": { [employeeId]: { shiftId, ot } } }
  currentDate: new Date(),  // วันที่อ้างอิงของ toolbar
  viewMode: 'week',         // 'day' | 'week' | 'month'
  layout: 'employee',       // 'employee' = (A) แถวพนักงาน | 'shift' = (B) แถวผลัด
  page: 'schedule',         // หน้าปัจจุบัน
  assign: {                 // สถานะของ modal กำหนดผลัด
    empId: '',
    date: '',
    shiftId: '',
    ot: false,
    pick: false,
    preset: ''
  }
};


/* =====================================================================
 * 2. Utilities
 *    ฟังก์ชันช่วยเหลือทั่วไป: DOM, วันที่, ข้อความ, สี, toast
 * ===================================================================== */

// ทางลัดเลือก element
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

// เติมเลข 0 ข้างหน้าให้ครบ 2 หลัก
function pad2(n) {
  return String(n).padStart(2, '0');
}

// สร้าง id ไม่ซ้ำ
function uid() {
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// แปลง Date เป็น "YYYY-MM-DD" (ตามเวลาท้องถิ่น)
function toISO(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

// แปลง "YYYY-MM-DD" เป็น Date (เวลาท้องถิ่น 00:00)
function parseISO(iso) {
  const p = iso.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

// ตรวจว่าเป็นวันที่รูปแบบ YYYY-MM-DD ที่มีอยู่จริง
function isValidISO(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISO(parseISO(s)) === s;
}

// บวก/ลบวัน
function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// บวก/ลบเดือน (ถ้าวันที่เกินวันสุดท้ายของเดือนใหม่ ให้ใช้วันสุดท้ายแทน)
function addMonths(d, n) {
  const y = d.getFullYear();
  const m = d.getMonth() + n;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d.getDate(), lastDay));
}

// คืนวันจันทร์–อาทิตย์ ของสัปดาห์ที่มีวันที่ d
function getWeekDates(d) {
  const dow = (d.getDay() + 6) % 7; // จันทร์ = 0 ... อาทิตย์ = 6
  const monday = addDays(d, -dow);
  const list = [];
  for (let i = 0; i < 7; i++) list.push(addDays(monday, i));
  return list;
}

// คืนทุกวันในเดือนของ d
function getMonthDates(d) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const list = [];
  for (let i = 1; i <= days; i++) list.push(new Date(y, m, i));
  return list;
}

// คืนรายการวันที่ที่ต้องแสดง ตาม view mode
function getVisibleDates() {
  const cur = state.currentDate;
  if (state.viewMode === 'day') {
    return [new Date(cur.getFullYear(), cur.getMonth(), cur.getDate())];
  }
  if (state.viewMode === 'week') return getWeekDates(cur);
  return getMonthDates(cur);
}

// จัดรูปแบบวันที่ไทย เช่น "จันทร์ 5 มกราคม 2569"
function formatThaiDate(d) {
  return THAI_DAYS_FULL[d.getDay()] + ' ' + d.getDate() + ' ' +
    THAI_MONTHS[d.getMonth()] + ' ' + (d.getFullYear() + 543);
}

// จัดรูปแบบวันที่ไทยแบบสั้น เช่น "จ. 5 ม.ค. 2569"
function formatThaiDateShort(d) {
  return THAI_DAYS_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' +
    THAI_MONTHS_SHORT[d.getMonth()] + ' ' + (d.getFullYear() + 543);
}

// ข้อความช่วงวันที่บน toolbar ตาม view mode
function formatRangeLabel() {
  const cur = state.currentDate;
  if (state.viewMode === 'day') return formatThaiDate(cur);
  if (state.viewMode === 'month') {
    return THAI_MONTHS[cur.getMonth()] + ' ' + (cur.getFullYear() + 543);
  }
  const week = getWeekDates(cur);
  const s = week[0];
  const e = week[6];
  const yS = s.getFullYear() + 543;
  const yE = e.getFullYear() + 543;
  if (s.getFullYear() !== e.getFullYear()) {
    return s.getDate() + ' ' + THAI_MONTHS_SHORT[s.getMonth()] + ' ' + yS + ' – ' +
      e.getDate() + ' ' + THAI_MONTHS_SHORT[e.getMonth()] + ' ' + yE;
  }
  if (s.getMonth() !== e.getMonth()) {
    return s.getDate() + ' ' + THAI_MONTHS_SHORT[s.getMonth()] + ' – ' +
      e.getDate() + ' ' + THAI_MONTHS_SHORT[e.getMonth()] + ' ' + yE;
  }
  return s.getDate() + ' – ' + e.getDate() + ' ' + THAI_MONTHS_SHORT[e.getMonth()] + ' ' + yE;
}

// escape ข้อความก่อนใส่ลง innerHTML เพื่อกัน XSS
function escapeHtml(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// เลือกสีตัวอักษร (ขาว/ดำ) ให้อ่านง่ายบนพื้นสีของผลัด
function textColorFor(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return '#ffffff';
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.72 ? '#222222' : '#ffffff';
}

// ค้นหาผลัด / พนักงานจาก id
function getShift(id) {
  return state.shifts.find(function (s) { return s.id === id; }) || null;
}
function getEmployee(id) {
  return state.employees.find(function (e) { return e.id === id; }) || null;
}

// ผลัดนี้ข้ามวันหรือไม่ (ติ๊ก overnight หรือเวลาสิ้นสุด < เวลาเริ่ม)
function isOvernight(shift) {
  if (!shift || shift.isOff) return false;
  if (shift.overnight) return true;
  return !!(shift.startTime && shift.endTime && shift.endTime < shift.startTime);
}

// ข้อความเวลาของผลัด เช่น "07:00–16:00" หรือ "หยุด"
function shiftTimeText(shift) {
  if (!shift || shift.isOff || (!shift.startTime && !shift.endTime)) return 'หยุด';
  return shift.startTime + '–' + shift.endTime;
}

// ข้อความรายละเอียดผลัด เช่น "22:00–07:00 • ข้ามวัน • OT ถึง 10:00"
function shiftDetailText(shift) {
  const parts = [shiftTimeText(shift)];
  if (isOvernight(shift)) parts.push('ข้ามวัน');
  if (shift.otUntil) parts.push('OT ถึง ' + shift.otUntil);
  return parts.join(' • ');
}

// ชื่อเรียกผลัดแบบเต็ม เช่น "เช้า (M)" หรือ "ผลัด T08"
function shiftLabel(shift) {
  if (!shift) return 'ไม่ทราบผลัด';
  return shift.name ? shift.name + ' (' + shift.code + ')' : 'ผลัด ' + shift.code;
}

// สร้าง HTML ของ chip ผลัด (แสดง code และ " +OT" ถ้ามี OT)
function chipHTML(shift, ot) {
  if (!shift) return '<span class="chip chip-unknown">?</span>';
  const label = escapeHtml(shift.code) + (ot ? ' +OT' : '');
  const title = escapeHtml(shiftLabel(shift) + ' ' + shiftDetailText(shift));
  return '<span class="chip" title="' + title + '" style="background:' + shift.color +
    ';color:' + textColorFor(shift.color) + '">' + label + '</span>';
}

// ชื่อสั้น (ใช้ตอนพื้นที่แคบ เช่น มุมมองเดือน)
function shortName(fullname) {
  return String(fullname || '').trim().split(/\s+/)[0] || '';
}

// อ่าน/เขียน/ลบ รายการใน schedule
function getEntry(iso, empId) {
  const day = state.schedule[iso];
  return day && day[empId] ? day[empId] : null;
}
function setEntry(iso, empId, entry) {
  if (!state.schedule[iso]) state.schedule[iso] = {};
  state.schedule[iso][empId] = entry;
}
function clearEntry(iso, empId) {
  const day = state.schedule[iso];
  if (!day) return;
  delete day[empId];
  if (Object.keys(day).length === 0) delete state.schedule[iso];
}

// ลบรายการใน schedule ที่เข้าเงื่อนไข แล้วคืนจำนวนที่ลบ
function removeScheduleWhere(predicate) {
  let count = 0;
  Object.keys(state.schedule).forEach(function (iso) {
    const day = state.schedule[iso];
    Object.keys(day).forEach(function (empId) {
      if (predicate(day[empId], empId, iso)) {
        delete day[empId];
        count++;
      }
    });
    if (Object.keys(day).length === 0) delete state.schedule[iso];
  });
  return count;
}

// นับจำนวนรายการใน schedule ที่เข้าเงื่อนไข
function countScheduleWhere(predicate) {
  let count = 0;
  Object.keys(state.schedule).forEach(function (iso) {
    const day = state.schedule[iso];
    Object.keys(day).forEach(function (empId) {
      if (predicate(day[empId], empId, iso)) count++;
    });
  });
  return count;
}

// ข้อความแจ้งสั้น ๆ (toast)
let toastTimer = null;
function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
}

// ทำเครื่องหมายช่องกรอกที่ผิด + แจ้งเตือน (คืน false เพื่อใช้ return ต่อได้เลย)
function invalidField(selector, msg) {
  const el = $(selector);
  if (el) {
    el.classList.add('invalid');
    el.focus();
  }
  showToast(msg);
  return false;
}

// เปิด/ปิด modal (bottom-sheet)
function openModal(id) {
  const m = $('#' + id);
  m.classList.add('open');
  m.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}
function closeModal(m) {
  m.classList.remove('open');
  m.setAttribute('aria-hidden', 'true');
  if (!$('.modal.open')) document.body.classList.remove('modal-open');
}
function closeAllModals() {
  $$('.modal.open').forEach(closeModal);
}

// แปลงค่าเวลาให้เป็น "HH:MM" (รองรับ "7:00", "07:00:00", เลขเศษส่วนของ Excel)
function normalizeTime(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const mins = Math.round(v * 24 * 60);
    return pad2(Math.floor(mins / 60) % 24) + ':' + pad2(mins % 60);
  }
  const m = String(v).trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?/);
  if (!m) return '';
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return '';
  return pad2(h) + ':' + pad2(mi);
}

// แปลงค่าวันที่ให้เป็น "YYYY-MM-DD" (รองรับ YYYY-M-D, D/M/YYYY, ปี พ.ศ., เลข serial ของ Excel)
function normalizeDate(v) {
  function build(y, m, d) {
    const iso = Number(y) + '-' + pad2(Number(m)) + '-' + pad2(Number(d));
    return isValidISO(iso) ? iso : '';
  }
  if (v instanceof Date && !isNaN(v)) return toISO(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return build(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v === null || v === undefined ? '' : v).trim();
  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) {
    let y = Number(m[1]);
    if (y > 2400) y -= 543;
    return build(y, m[2], m[3]);
  }
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (m) {
    let y = Number(m[3]);
    if (y > 2400) y -= 543;
    return build(y, m[2], m[1]);
  }
  return '';
}

// แปลงค่าเป็น boolean (รองรับ 1/true/yes/y/ot/x/✓)
function parseBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  const s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'ot', 'x', '✓', 'ใช่'].indexOf(s) !== -1;
}

// ทำให้ id ปลอดภัย (ตัวอักษร/ตัวเลข/_/- เท่านั้น และไม่ซ้ำ)
function safeId(id, used) {
  let s = (typeof id === 'string' || typeof id === 'number') ? String(id).trim() : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(s) || s === '__proto__' || (used && used.has(s))) {
    s = uid();
  }
  if (used) used.add(s);
  return s;
}

// ล้างข้อมูลพนักงานให้อยู่ในรูปแบบมาตรฐาน (คืน null ถ้าข้อมูลไม่ใช้ได้)
function sanitizeEmployee(e, usedIds) {
  if (!e || typeof e !== 'object') return null;
  const fullname = String(e.fullname !== undefined ? e.fullname : (e.name !== undefined ? e.name : '')).trim();
  if (!fullname) return null;
  return {
    id: safeId(e.id, usedIds),
    code: String(e.code === undefined || e.code === null ? '' : e.code).trim(),
    fullname: fullname,
    position: String(e.position === undefined || e.position === null ? '' : e.position).trim(),
    phone: String(e.phone === undefined || e.phone === null ? '' : e.phone).trim()
  };
}

// ล้างข้อมูลผลัดให้อยู่ในรูปแบบมาตรฐาน (คืน null ถ้าไม่มี code)
function sanitizeShift(s, usedIds) {
  if (!s || typeof s !== 'object') return null;
  const code = String(s.code === undefined || s.code === null ? '' : s.code).trim();
  if (!code) return null;
  const startTime = normalizeTime(s.startTime !== undefined ? s.startTime : s.start);
  const endTime = normalizeTime(s.endTime !== undefined ? s.endTime : s.end);
  const isOff = !!s.isOff;
  return {
    id: safeId(s.id, usedIds),
    code: code,
    name: String(s.name === undefined || s.name === null ? '' : s.name).trim(),
    startTime: isOff ? '' : startTime,
    endTime: isOff ? '' : endTime,
    color: /^#[0-9a-fA-F]{6}$/.test(String(s.color || '')) ? String(s.color) : DEFAULT_SHIFT_COLOR,
    overnight: isOff ? false : (!!s.overnight || !!(startTime && endTime && endTime < startTime)),
    otUntil: isOff ? null : (normalizeTime(s.otUntil) || null),
    isOff: isOff
  };
}

// ล้างข้อมูลทั้งชุด (employees/shifts/schedule) และตัดรายการที่อ้างอิงไม่ถูกต้องทิ้ง
function sanitizeAll(rawEmps, rawShifts, rawSched) {
  const usedE = new Set();
  const usedS = new Set();
  const employees = (Array.isArray(rawEmps) ? rawEmps : [])
    .map(function (e) { return sanitizeEmployee(e, usedE); })
    .filter(Boolean);
  const shifts = (Array.isArray(rawShifts) ? rawShifts : [])
    .map(function (s) { return sanitizeShift(s, usedS); })
    .filter(Boolean);
  const empIds = new Set(employees.map(function (e) { return e.id; }));
  const shiftIds = new Set(shifts.map(function (s) { return s.id; }));
  const schedule = {};
  let dropped = 0;

  if (rawSched && typeof rawSched === 'object' && !Array.isArray(rawSched)) {
    Object.keys(rawSched).forEach(function (iso) {
      const day = rawSched[iso];
      if (!isValidISO(iso) || !day || typeof day !== 'object') {
        dropped++;
        return;
      }
      Object.keys(day).forEach(function (empId) {
        const en = day[empId];
        if (empIds.has(empId) && en && typeof en === 'object' && shiftIds.has(en.shiftId)) {
          if (!schedule[iso]) schedule[iso] = {};
          schedule[iso][empId] = { shiftId: en.shiftId, ot: !!en.ot };
        } else {
          dropped++;
        }
      });
    });
  }
  return { employees: employees, shifts: shifts, schedule: schedule, dropped: dropped };
}


/* =====================================================================
 * 3. Storage (load/save)
 *    อ่าน/เขียน localStorage — ถ้าไม่มีข้อมูลผลัด ให้ใส่ผลัดเริ่มต้น
 * ===================================================================== */

// อ่านค่า JSON จาก localStorage (ถ้าไม่มี/พัง คืน fallback)
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const val = JSON.parse(raw);
    return val === null || val === undefined ? fallback : val;
  } catch (err) {
    return fallback;
  }
}

// เขียนค่า JSON ลง localStorage
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    showToast('บันทึกข้อมูลไม่สำเร็จ (พื้นที่เก็บข้อมูลเต็มหรือถูกปิดใช้งาน)');
    return false;
  }
}

function saveEmployees() { return saveJSON(LS_EMPLOYEES, state.employees); }
function saveShifts() { return saveJSON(LS_SHIFTS, state.shifts); }
function saveSchedule() { return saveJSON(LS_SCHEDULE, state.schedule); }
function saveAll() {
  const a = saveEmployees();
  const b = saveShifts();
  const c = saveSchedule();
  return a && b && c;
}

// สร้างรายการผลัดเริ่มต้นพร้อม id
function buildDefaultShifts() {
  return DEFAULT_SHIFT_SEED.map(function (s) {
    return {
      id: uid(),
      code: s.code,
      name: s.name,
      startTime: s.start,
      endTime: s.end,
      color: s.color,
      overnight: s.overnight,
      otUntil: s.otUntil,
      isOff: !!s.isOff
    };
  });
}

// โหลดข้อมูลทั้งหมดเข้า state
function loadAll() {
  const rawEmps = loadJSON(LS_EMPLOYEES, null);
  const rawShifts = loadJSON(LS_SHIFTS, null);
  const rawSched = loadJSON(LS_SCHEDULE, null);

  const clean = sanitizeAll(rawEmps, rawShifts, rawSched);
  state.employees = clean.employees;
  state.shifts = clean.shifts;
  state.schedule = clean.schedule;

  // ครั้งแรก (ยังไม่เคยมีข้อมูลผลัด) → ใส่ผลัดเริ่มต้น
  if (!Array.isArray(rawShifts)) {
    state.shifts = buildDefaultShifts();
    saveShifts();
  }
}


/* =====================================================================
 * 4. Page Navigation
 *    สลับหน้าด้วย class .active (ไม่ reload) + เมนู hamburger บนมือถือ
 * ===================================================================== */

// เปิด/ปิดเมนู Nav บนมือถือ
function setNavOpen(open) {
  $('#mainNav').classList.toggle('open', open);
  const btn = $('#btnHamburger');
  btn.setAttribute('aria-expanded', String(open));
  btn.setAttribute('aria-label', open ? 'ปิดเมนู' : 'เปิดเมนู');
}

// สลับไปหน้าที่ต้องการ
function showPage(name) {
  state.page = name;
  $$('.page').forEach(function (p) {
    p.classList.toggle('active', p.id === 'page-' + name);
  });
  $$('.nav-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.page === name);
  });

  // toolbar ใช้เฉพาะหน้าตารางงาน
  $('#toolbar').hidden = (name !== 'schedule');
  setNavOpen(false);

  // วาดเนื้อหาของหน้านั้นใหม่ให้เป็นข้อมูลล่าสุด
  if (name === 'schedule') {
    renderSchedule({ resetScroll: true });
  } else if (name === 'history') {
    initHistory();
    loadHistory();
  } else if (name === 'employees') {
    renderEmployees();
  } else if (name === 'shifts') {
    renderShifts();
  } else if (name === 'summary') {
    if (!$('#summaryDate').value) $('#summaryDate').value = toISO(new Date());
    loadSummary();
  }
  window.scrollTo(0, 0);
}

// ผูกอีเวนต์ของ Nav และ Hamburger
function bindNavigation() {
  $('#mainNav').addEventListener('click', function (e) {
    const btn = e.target.closest('.nav-btn');
    if (btn) showPage(btn.dataset.page);
  });
  $('#btnHamburger').addEventListener('click', function () {
    setNavOpen(!$('#mainNav').classList.contains('open'));
  });
}


/* =====================================================================
 * 5. Toolbar / View Mode
 *    เลือก วัน/สัปดาห์/เดือน, เลื่อนช่วงเวลา, สลับมุมมอง (A)/(B)
 * ===================================================================== */

// อัปเดตข้อความและสถานะปุ่มบน toolbar
function updateToolbarLabels() {
  $('#dateLabel').textContent = formatRangeLabel();
  $$('.seg-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.view === state.viewMode);
  });
  $('#layoutModeLabel').textContent =
    state.layout === 'employee' ? '(แถว = พนักงาน)' : '(แถว = ผลัด)';
}

// เปลี่ยน view mode
function setViewMode(mode) {
  state.viewMode = mode;
  renderSchedule({ resetScroll: true });
}

// เลื่อนช่วงเวลาไปหน้า/หลัง (dir = -1 หรือ 1)
function shiftRange(dir) {
  const cur = state.currentDate;
  if (state.viewMode === 'day') state.currentDate = addDays(cur, dir);
  else if (state.viewMode === 'week') state.currentDate = addDays(cur, 7 * dir);
  else state.currentDate = addMonths(cur, dir);
  renderSchedule({ resetScroll: true });
}

// กลับมาวันนี้
function goToday() {
  state.currentDate = new Date();
  renderSchedule({ resetScroll: true });
}

// สลับมุมมอง (A) แถว=พนักงาน  ↔  (B) แถว=ผลัด
function toggleLayout() {
  state.layout = state.layout === 'employee' ? 'shift' : 'employee';
  renderSchedule({ resetScroll: true });
}

// ผูกอีเวนต์ของ toolbar
function bindToolbar() {
  $$('.seg-btn').forEach(function (b) {
    b.addEventListener('click', function () { setViewMode(b.dataset.view); });
  });
  $('#btnPrev').addEventListener('click', function () { shiftRange(-1); });
  $('#btnNext').addEventListener('click', function () { shiftRange(1); });
  $('#btnToday').addEventListener('click', goToday);
  $('#btnSwapLayout').addEventListener('click', toggleLayout);
}


/* =====================================================================
 * 6. Render Schedule (2 มุมมอง)
 *    (A) แถว = พนักงาน, คอลัมน์ = วัน, cell = chip ผลัด
 *    (B) แถว = ผลัด,   คอลัมน์ = วัน, cell = ชื่อคน (list)
 * ===================================================================== */

// หัวคอลัมน์วันที่
function dateHeadHTML(d, todayIso) {
  const iso = toISO(d);
  const dow = d.getDay();
  const cls = ['date-head'];
  if (iso === todayIso) cls.push('today');
  if (dow === 0 || dow === 6) cls.push('weekend');
  return '<th class="' + cls.join(' ') + '" scope="col" data-date="' + iso + '">' +
    '<span class="dow">' + THAI_DAYS_SHORT[dow] + '</span>' +
    '<span class="dom">' + d.getDate() + '</span></th>';
}

// (A) ตารางแถว = พนักงาน
function buildEmployeeView(dates) {
  if (state.employees.length === 0) {
    return '<div class="empty-state">ยังไม่มีพนักงาน<br>ไปที่เมนู "พนักงาน" เพื่อเพิ่มพนักงานก่อน</div>';
  }
  const todayIso = toISO(new Date());
  let html = '<table class="sched-table layout-employee view-' + state.viewMode + '">';
  html += '<thead><tr><th class="sticky-col corner" scope="col">พนักงาน</th>';
  dates.forEach(function (d) { html += dateHeadHTML(d, todayIso); });
  html += '</tr></thead><tbody>';

  state.employees.forEach(function (emp) {
    html += '<tr><th class="sticky-col row-head" scope="row">';
    html += '<div class="emp-name">' + escapeHtml(emp.fullname) + '</div>';
    if (emp.position) html += '<div class="emp-sub">' + escapeHtml(emp.position) + '</div>';
    html += '</th>';

    dates.forEach(function (d) {
      const iso = toISO(d);
      const entry = getEntry(iso, emp.id);
      const inner = entry
        ? chipHTML(getShift(entry.shiftId), entry.ot)
        : '<span class="cell-empty" aria-hidden="true">＋</span>';
      html += '<td class="cell' + (iso === todayIso ? ' today' : '') + '" data-emp="' +
        escapeHtml(emp.id) + '" data-date="' + iso + '">';
      html += '<button type="button" class="cell-btn" aria-label="กำหนดผลัด ' +
        escapeHtml(emp.fullname) + ' ' + formatThaiDate(d) + '">' + inner + '</button>';
      html += '</td>';
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  return html;
}

// (B) ตารางแถว = ผลัด
function buildShiftView(dates) {
  if (state.shifts.length === 0) {
    return '<div class="empty-state">ยังไม่มีผลัด<br>ไปที่เมนู "ผลัด" เพื่อเพิ่มผลัดก่อน</div>';
  }
  const todayIso = toISO(new Date());
  const compact = state.viewMode === 'month';
  let html = '<table class="sched-table layout-shift view-' + state.viewMode + '">';
  html += '<thead><tr><th class="sticky-col corner" scope="col">ผลัด</th>';
  dates.forEach(function (d) { html += dateHeadHTML(d, todayIso); });
  html += '</tr></thead><tbody>';

  state.shifts.forEach(function (shift) {
    html += '<tr><th class="sticky-col row-head" scope="row">';
    html += '<div class="shift-head">' + chipHTML(shift, false);
    if (shift.name) html += ' <span class="shift-name">' + escapeHtml(shift.name) + '</span>';
    html += '</div>';
    html += '<div class="emp-sub">' + escapeHtml(shiftTimeText(shift)) + '</div>';
    html += '</th>';

    dates.forEach(function (d) {
      const iso = toISO(d);
      const day = state.schedule[iso] || {};
      let names = '';
      state.employees.forEach(function (emp) {
        const en = day[emp.id];
        if (en && en.shiftId === shift.id) {
          const label = compact ? shortName(emp.fullname) : emp.fullname;
          names += '<button type="button" class="name-item" data-emp="' + escapeHtml(emp.id) +
            '" data-date="' + iso + '" title="' + escapeHtml(emp.fullname) + '">' +
            escapeHtml(label) + (en.ot ? ' <span class="ot-tag">+OT</span>' : '') + '</button>';
        }
      });
      html += '<td class="cell' + (iso === todayIso ? ' today' : '') + '" data-shift="' +
        escapeHtml(shift.id) + '" data-date="' + iso + '">';
      if (names) html += '<div class="name-list">' + names + '</div>';
      html += '<button type="button" class="cell-add" aria-label="เพิ่มพนักงานในผลัด ' +
        escapeHtml(shift.code) + ' ' + formatThaiDate(d) + '">＋</button>';
      html += '</td>';
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  return html;
}

// แสดงคำอธิบายสีของผลัดใต้ตาราง
function renderLegend() {
  const box = $('#shiftLegend');
  if (state.shifts.length === 0) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = state.shifts.map(function (s) {
    return '<span class="legend-item">' + chipHTML(s, false) +
      '<small>' + escapeHtml((s.name ? s.name + ' ' : '') + shiftTimeText(s)) + '</small></span>';
  }).join('');
}

// เลื่อนตารางให้เห็นวันนี้ (ใช้ในมุมมองเดือน)
function scrollToToday(wrap) {
  const th = wrap.querySelector('th.date-head.today');
  if (!th) return;
  const first = wrap.querySelector('.sticky-col');
  const offset = first ? first.offsetWidth : 0;
  wrap.scrollLeft = Math.max(0, th.offsetLeft - offset - 8);
}

// วาดตารางงานตาม view mode และมุมมองที่เลือก
function renderSchedule(opts) {
  opts = opts || {};
  const wrap = $('#scheduleWrap');
  const prevLeft = wrap.scrollLeft;
  const prevTop = wrap.scrollTop;

  updateToolbarLabels();
  renderLegend();

  const dates = getVisibleDates();
  wrap.innerHTML = state.layout === 'employee' ? buildEmployeeView(dates) : buildShiftView(dates);

  if (opts.resetScroll) {
    wrap.scrollTop = 0;
    wrap.scrollLeft = 0;
    if (state.viewMode === 'month') scrollToToday(wrap);
  } else {
    wrap.scrollLeft = prevLeft;
    wrap.scrollTop = prevTop;
  }
}

// แตะ cell → เปิด modal กำหนดผลัด
function bindScheduleClicks() {
  $('#scheduleWrap').addEventListener('click', function (e) {
    // (B) แตะชื่อคน → แก้ผลัดของคนนั้น
    const nameBtn = e.target.closest('.name-item');
    if (nameBtn) {
      openAssign(nameBtn.dataset.emp, nameBtn.dataset.date, {});
      return;
    }
    const cell = e.target.closest('td.cell');
    if (!cell) return;
    if (state.layout === 'employee') {
      openAssign(cell.dataset.emp, cell.dataset.date, {});
    } else {
      // (B) แตะช่องว่างของ cell → เลือกพนักงานเพิ่มเข้าผลัดนี้
      openAssign('', cell.dataset.date, { pickEmployee: true, presetShiftId: cell.dataset.shift });
    }
  });
}


/* =====================================================================
 * 7. Assign Modal
 *    กำหนดผลัดให้พนักงาน 1 คน / 1 วัน (1 พนักงาน = 1 ผลัด/วัน)
 *    OT เก็บเป็น flag ใน schedule[date][empId].ot
 * ===================================================================== */

// เลือกพนักงานเริ่มต้นสำหรับโหมดเลือกพนักงาน (คนแรกที่ยังไม่มีผลัดในวันนั้น)
function defaultPickEmployee(iso) {
  const free = state.employees.find(function (e) { return !getEntry(iso, e.id); });
  return (free || state.employees[0]).id;
}

// โหลดผลัดที่เลือกอยู่ (ถ้ามีรายการเดิม ใช้ค่าเดิม)
function loadAssignSelection() {
  const a = state.assign;
  const entry = getEntry(a.date, a.empId);
  if (entry && getShift(entry.shiftId)) {
    a.shiftId = entry.shiftId;
    a.ot = !!entry.ot;
  } else {
    a.shiftId = a.pick ? a.preset : '';
    a.ot = false;
  }
}

// สร้าง HTML ของตัวเลือก radio 1 รายการ
function radioItemHTML(value, checked, chip, body) {
  return '<label class="radio-item' + (checked ? ' selected' : '') + '">' +
    '<input type="radio" name="assignShift" value="' + escapeHtml(value) + '"' +
    (checked ? ' checked' : '') + '>' + chip +
    '<span class="radio-item-body">' + body + '</span></label>';
}

// วาดรายการ radio ของผลัดทั้งหมด + ตัวเลือก "ไม่ทำงาน"
function renderAssignShiftList() {
  const a = state.assign;
  let html = radioItemHTML(
    '',
    a.shiftId === '',
    '<span class="chip chip-none">—</span>',
    '<strong>ไม่ทำงาน</strong><small class="radio-time">ล้างการกำหนดผลัดของวันนี้</small>'
  );
  state.shifts.forEach(function (s) {
    html += radioItemHTML(
      s.id,
      a.shiftId === s.id,
      chipHTML(s, false),
      '<strong>' + escapeHtml(s.name || ('ผลัด ' + s.code)) + '</strong>' +
      '<small class="radio-time">' + escapeHtml(shiftDetailText(s)) + '</small>'
    );
  });
  $('#assignShiftList').innerHTML = html;
}

// แสดง/ซ่อน checkbox OT ตามผลัดที่เลือก
function updateAssignOT() {
  const a = state.assign;
  const shift = getShift(a.shiftId);
  const row = $('#assignOTRow');
  if (shift && shift.otUntil && !shift.isOff) {
    row.hidden = false;
    $('#assignOTLabel').textContent = 'ทำ OT ถึง ' + shift.otUntil;
    $('#assignOT').checked = a.ot;
  } else {
    row.hidden = true;
    a.ot = false;
    $('#assignOT').checked = false;
  }
}

// อัปเดตหัวข้อ modal
function updateAssignTitle() {
  const a = state.assign;
  const dateText = formatThaiDate(parseISO(a.date));
  if (a.pick) {
    $('#assignTitle').textContent = 'กำหนดผลัด • ' + dateText;
  } else {
    const emp = getEmployee(a.empId);
    $('#assignTitle').textContent = (emp ? emp.fullname : '') + ' • ' + dateText;
  }
}

// เปิด modal กำหนดผลัด
// opts.pickEmployee = true → แสดงช่องเลือกพนักงาน (ใช้จากมุมมอง B)
// opts.presetShiftId    → ผลัดที่เลือกไว้ล่วงหน้า (ใช้จากมุมมอง B)
function openAssign(empId, iso, opts) {
  opts = opts || {};
  if (state.employees.length === 0) {
    showToast('กรุณาเพิ่มพนักงานก่อน');
    return;
  }
  if (state.shifts.length === 0) {
    showToast('กรุณาเพิ่มผลัดก่อน');
    return;
  }
  const pick = !!opts.pickEmployee;
  if (pick) {
    empId = defaultPickEmployee(iso);
  } else if (!getEmployee(empId)) {
    return;
  }

  const a = state.assign;
  a.empId = empId;
  a.date = iso;
  a.pick = pick;
  a.preset = opts.presetShiftId || '';
  loadAssignSelection();

  // ช่องเลือกพนักงาน (เฉพาะโหมด pick)
  const row = $('#assignEmployeeRow');
  row.hidden = !pick;
  if (pick) {
    $('#assignEmployeeSelect').innerHTML = state.employees.map(function (e) {
      return '<option value="' + escapeHtml(e.id) + '">' + escapeHtml(e.fullname) +
        (e.position ? ' (' + escapeHtml(e.position) + ')' : '') + '</option>';
    }).join('');
    $('#assignEmployeeSelect').value = a.empId;
  }

  updateAssignTitle();
  renderAssignShiftList();
  updateAssignOT();
  openModal('modalAssign');
}

// คัดลอกผลัดจากเมื่อวาน (schedule[date-1][empId])
function copyFromYesterday() {
  const a = state.assign;
  const prevIso = toISO(addDays(parseISO(a.date), -1));
  const entry = getEntry(prevIso, a.empId);
  if (!entry) {
    showToast('เมื่อวานไม่ได้กำหนดผลัดให้พนักงานคนนี้');
    return;
  }
  const shift = getShift(entry.shiftId);
  if (!shift) {
    showToast('ผลัดของเมื่อวานถูกลบไปแล้ว');
    return;
  }
  a.shiftId = shift.id;
  a.ot = !!entry.ot && !!shift.otUntil;
  renderAssignShiftList();
  updateAssignOT();
  showToast('คัดลอกจากเมื่อวานแล้ว กด "บันทึก" เพื่อยืนยัน');
}

// บันทึกการกำหนดผลัด
function saveAssign(e) {
  e.preventDefault();
  const a = state.assign;
  if (!getEmployee(a.empId)) {
    showToast('กรุณาเลือกพนักงาน');
    return;
  }
  if (a.shiftId === '') {
    clearEntry(a.date, a.empId);          // "ไม่ทำงาน" = ล้างรายการ
  } else {
    const shift = getShift(a.shiftId);
    if (!shift) {
      showToast('ไม่พบผลัดที่เลือก');
      return;
    }
    // OT ติ๊กได้เฉพาะผลัดที่มี otUntil
    setEntry(a.date, a.empId, { shiftId: shift.id, ot: !!(a.ot && shift.otUntil) });
  }
  saveSchedule();
  closeModal($('#modalAssign'));
  renderSchedule();
  showToast('บันทึกแล้ว');
}

// ผูกอีเวนต์ของ modal กำหนดผลัด
function bindAssignModal() {
  // เลือก radio ผลัด
  $('#assignShiftList').addEventListener('change', function (e) {
    if (e.target.name !== 'assignShift') return;
    state.assign.shiftId = e.target.value;
    $$('.radio-item', $('#assignShiftList')).forEach(function (label) {
      label.classList.toggle('selected', label.querySelector('input').checked);
    });
    updateAssignOT();
  });
  // ติ๊ก OT
  $('#assignOT').addEventListener('change', function (e) {
    state.assign.ot = e.target.checked;
  });
  // เปลี่ยนพนักงาน (โหมด pick)
  $('#assignEmployeeSelect').addEventListener('change', function (e) {
    state.assign.empId = e.target.value;
    loadAssignSelection();
    renderAssignShiftList();
    updateAssignOT();
  });
  $('#btnCopyYesterday').addEventListener('click', copyFromYesterday);
  $('#assignForm').addEventListener('submit', saveAssign);
}


/* =====================================================================
 * 8. Employee CRUD
 *    เพิ่ม/แก้ไข/ลบ พนักงาน (ลบแล้วลบ schedule ที่เกี่ยวข้องด้วย)
 * ===================================================================== */

// วาดรายการพนักงานเป็นการ์ด
function renderEmployees() {
  const box = $('#employeeList');
  if (state.employees.length === 0) {
    box.innerHTML = '<div class="empty-state">ยังไม่มีพนักงาน<br>กด "+ เพิ่มพนักงาน" เพื่อเริ่มต้น</div>';
    return;
  }
  box.innerHTML = state.employees.map(function (emp) {
    return '<article class="card" data-id="' + escapeHtml(emp.id) + '">' +
      '<div class="card-main">' +
        '<div class="card-title">' + escapeHtml(emp.fullname) +
          (emp.code ? ' <span class="badge">' + escapeHtml(emp.code) + '</span>' : '') + '</div>' +
        '<div class="card-sub">' + escapeHtml(emp.position || '-') + '</div>' +
        '<div class="card-meta">📞 ' + (emp.phone
          ? '<a href="tel:' + escapeHtml(emp.phone.replace(/[^0-9+]/g, '')) + '">' + escapeHtml(emp.phone) + '</a>'
          : '-') + '</div>' +
      '</div>' +
      '<div class="card-actions">' +
        '<button type="button" class="icon-btn" data-action="edit" aria-label="แก้ไข ' + escapeHtml(emp.fullname) + '">✏️</button>' +
        '<button type="button" class="icon-btn danger" data-action="delete" aria-label="ลบ ' + escapeHtml(emp.fullname) + '">🗑️</button>' +
      '</div>' +
    '</article>';
  }).join('');
}

// เปิดฟอร์มพนักงาน (id ว่าง = เพิ่มใหม่)
function openEmployeeForm(id) {
  const emp = id ? getEmployee(id) : null;
  $('#employeeModalTitle').textContent = emp ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน';
  $('#empId').value = emp ? emp.id : '';
  $('#empCode').value = emp ? emp.code : '';
  $('#empName').value = emp ? emp.fullname : '';
  $('#empPosition').value = emp ? emp.position : '';
  $('#empPhone').value = emp ? emp.phone : '';
  $$('#employeeForm .invalid').forEach(function (el) { el.classList.remove('invalid'); });
  openModal('modalEmployee');
  $('#empName').focus();
}

// บันทึกพนักงาน
function saveEmployee(e) {
  e.preventDefault();
  const id = $('#empId').value;
  const code = $('#empCode').value.trim();
  const fullname = $('#empName').value.trim().replace(/\s+/g, ' ');
  const position = $('#empPosition').value.trim();
  const phone = $('#empPhone').value.trim();

  if (!fullname) return invalidField('#empName', 'กรุณากรอกชื่อ-สกุล');
  if (!position) return invalidField('#empPosition', 'กรุณากรอกตำแหน่ง');
  if (!phone) return invalidField('#empPhone', 'กรุณากรอกเบอร์โทร');
  if (!/^[0-9+\-\s()]+$/.test(phone) || phone.replace(/\D/g, '').length < 8) {
    return invalidField('#empPhone', 'เบอร์โทรไม่ถูกต้อง');
  }
  if (code) {
    const dup = state.employees.some(function (x) {
      return x.id !== id && x.code && x.code.toLowerCase() === code.toLowerCase();
    });
    if (dup) return invalidField('#empCode', 'รหัสพนักงานนี้ถูกใช้แล้ว');
  }

  if (id) {
    const emp = getEmployee(id);
    if (emp) {
      emp.code = code;
      emp.fullname = fullname;
      emp.position = position;
      emp.phone = phone;
    }
  } else {
    state.employees.push({ id: uid(), code: code, fullname: fullname, position: position, phone: phone });
  }
  saveEmployees();
  closeModal($('#modalEmployee'));
  renderEmployees();
  renderSchedule();
  showToast('บันทึกพนักงานแล้ว');
  return true;
}

// ลบพนักงาน (confirm ก่อนลบ + ลบ schedule ที่เกี่ยวข้อง)
function deleteEmployee(id) {
  const emp = getEmployee(id);
  if (!emp) return;
  const count = countScheduleWhere(function (en, empId) { return empId === id; });
  const msg = 'ลบพนักงาน "' + emp.fullname + '" ?\n' +
    'ตารางงานของพนักงานคนนี้ (' + count + ' รายการ) จะถูกลบด้วย';
  if (!confirm(msg)) return;

  state.employees = state.employees.filter(function (x) { return x.id !== id; });
  removeScheduleWhere(function (en, empId) { return empId === id; });
  saveEmployees();
  saveSchedule();
  renderEmployees();
  renderSchedule();
  showToast('ลบพนักงานแล้ว');
}

// ผูกอีเวนต์ของหน้าพนักงาน
function bindEmployees() {
  $('#btnAddEmployee').addEventListener('click', function () { openEmployeeForm(''); });
  $('#employeeList').addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const card = btn.closest('.card');
    if (!card) return;
    if (btn.dataset.action === 'edit') openEmployeeForm(card.dataset.id);
    else if (btn.dataset.action === 'delete') deleteEmployee(card.dataset.id);
  });
  $('#employeeForm').addEventListener('submit', saveEmployee);
}


/* =====================================================================
 * 9. Shift CRUD
 *    เพิ่ม/แก้ไข/ลบ ผลัด (ลบแล้วลบ schedule ที่ใช้ผลัดนั้นด้วย)
 * ===================================================================== */

// วาดรายการผลัดเป็นการ์ด
function renderShifts() {
  const box = $('#shiftList');
  if (state.shifts.length === 0) {
    box.innerHTML = '<div class="empty-state">ยังไม่มีผลัด<br>กด "+ เพิ่มผลัด" เพื่อเริ่มต้น</div>';
    return;
  }
  box.innerHTML = state.shifts.map(function (s) {
    let sub = escapeHtml(shiftTimeText(s));
    if (isOvernight(s)) sub += ' <span class="tag">(ข้ามวัน)</span>';
    if (s.otUntil) sub += ' <span class="tag tag-ot">(OT ถึง ' + escapeHtml(s.otUntil) + ')</span>';
    return '<article class="card" data-id="' + escapeHtml(s.id) + '">' +
      '<div class="card-main">' +
        '<div class="card-title">' + chipHTML(s, false) + ' <span>' +
          escapeHtml(s.name || 'ผลัด ' + s.code) + '</span></div>' +
        '<div class="card-sub">' + sub + '</div>' +
      '</div>' +
      '<div class="card-actions">' +
        '<button type="button" class="icon-btn" data-action="edit" aria-label="แก้ไขผลัด ' + escapeHtml(s.code) + '">✏️</button>' +
        '<button type="button" class="icon-btn danger" data-action="delete" aria-label="ลบผลัด ' + escapeHtml(s.code) + '">🗑️</button>' +
      '</div>' +
    '</article>';
  }).join('');
}

// เปิดฟอร์มผลัด (id ว่าง = เพิ่มใหม่)
function openShiftForm(id) {
  const s = id ? getShift(id) : null;
  $('#shiftModalTitle').textContent = s ? 'แก้ไขผลัด' : 'เพิ่มผลัด';
  $('#shiftId').value = s ? s.id : '';
  $('#shiftName').value = s ? s.name : '';
  $('#shiftCode').value = s ? s.code : '';
  $('#shiftStart').value = s ? s.startTime : '';
  $('#shiftEnd').value = s ? s.endTime : '';
  $('#shiftOvernight').checked = s ? !!s.overnight : false;
  $('#shiftOtUntil').value = s && s.otUntil ? s.otUntil : '';
  $('#shiftColor').value = s ? s.color : DEFAULT_SHIFT_COLOR;
  // ผลัดหยุด (OFF) ไม่มีเวลา → ซ่อนส่วนเวลา
  $('#shiftTimeFields').hidden = !!(s && s.isOff);
  $$('#shiftForm .invalid').forEach(function (el) { el.classList.remove('invalid'); });
  openModal('modalShift');
  $('#shiftCode').focus();
}

// ถ้าเวลาสิ้นสุด < เวลาเริ่ม ให้ติ๊ก "ข้ามวัน" อัตโนมัติ
function autoTickOvernight() {
  const start = $('#shiftStart').value;
  const end = $('#shiftEnd').value;
  if (start && end && end < start) $('#shiftOvernight').checked = true;
}

// บันทึกผลัด
function saveShift(e) {
  e.preventDefault();
  const id = $('#shiftId').value;
  const existing = id ? getShift(id) : null;
  const isOff = !!(existing && existing.isOff);
  const name = $('#shiftName').value.trim();
  const code = $('#shiftCode').value.trim();
  const startTime = $('#shiftStart').value;
  const endTime = $('#shiftEnd').value;
  const otUntil = $('#shiftOtUntil').value;
  const color = $('#shiftColor').value;

  if (!code) return invalidField('#shiftCode', 'กรุณากรอกรหัสผลัด');
  const dup = state.shifts.some(function (x) {
    return x.id !== id && x.code.toLowerCase() === code.toLowerCase();
  });
  if (dup) return invalidField('#shiftCode', 'รหัสผลัดนี้ถูกใช้แล้ว');

  if (!isOff) {
    if (!startTime) return invalidField('#shiftStart', 'กรุณาเลือกเวลาเริ่ม');
    if (!endTime) return invalidField('#shiftEnd', 'กรุณาเลือกเวลาสิ้นสุด');
    if (startTime === endTime) return invalidField('#shiftEnd', 'เวลาเริ่มและเวลาสิ้นสุดต้องไม่เท่ากัน');
  }

  const data = {
    code: code,
    name: name,
    startTime: isOff ? '' : startTime,
    endTime: isOff ? '' : endTime,
    color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_SHIFT_COLOR,
    // ผลัดข้ามวัน: ติ๊ก overnight หรือ end < start
    overnight: isOff ? false : ($('#shiftOvernight').checked || endTime < startTime),
    otUntil: isOff ? null : (otUntil || null),
    isOff: isOff
  };

  if (existing) {
    Object.assign(existing, data);
  } else {
    state.shifts.push(Object.assign({ id: uid() }, data));
  }
  saveShifts();
  closeModal($('#modalShift'));
  renderShifts();
  renderSchedule();
  showToast('บันทึกผลัดแล้ว');
  return true;
}

// ลบผลัด (confirm + ลบ schedule ที่ใช้ผลัดนั้น)
function deleteShift(id) {
  const s = getShift(id);
  if (!s) return;
  const count = countScheduleWhere(function (en) { return en.shiftId === id; });
  const msg = 'ลบผลัด "' + shiftLabel(s) + '" ?\n' +
    'ตารางงานที่ใช้ผลัดนี้ (' + count + ' รายการ) จะถูกลบด้วย';
  if (!confirm(msg)) return;

  state.shifts = state.shifts.filter(function (x) { return x.id !== id; });
  removeScheduleWhere(function (en) { return en.shiftId === id; });
  saveShifts();
  saveSchedule();
  renderShifts();
  renderSchedule();
  showToast('ลบผลัดแล้ว');
}

// ผูกอีเวนต์ของหน้าผลัด
function bindShifts() {
  $('#btnAddShift').addEventListener('click', function () { openShiftForm(''); });
  $('#shiftList').addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const card = btn.closest('.card');
    if (!card) return;
    if (btn.dataset.action === 'edit') openShiftForm(card.dataset.id);
    else if (btn.dataset.action === 'delete') deleteShift(card.dataset.id);
  });
  $('#shiftForm').addEventListener('submit', saveShift);
  $('#shiftStart').addEventListener('change', autoTickOvernight);
  $('#shiftEnd').addEventListener('change', autoTickOvernight);
}


/* =====================================================================
 * 10. Summary (และหน้าย้อนหลัง)
 *     สรุปคนทำงานรายวันต่อผลัด, ดูตารางย้อนหลังรายเดือน (อ่านอย่างเดียว)
 * ===================================================================== */

// โหลดสรุปของวันที่เลือก
function loadSummary() {
  const iso = $('#summaryDate').value;
  const result = $('#summaryResult');
  const total = $('#summaryTotal');

  if (!isValidISO(iso)) {
    showToast('กรุณาเลือกวันที่');
    return;
  }
  if (state.employees.length === 0) {
    result.innerHTML = '<div class="empty-state">ยังไม่มีพนักงาน</div>';
    total.textContent = '';
    return;
  }

  const day = state.schedule[iso] || {};
  let html = '<div class="summary-date">' + escapeHtml(formatThaiDate(parseISO(iso))) + '</div>';
  let working = 0;   // นับเฉพาะผลัดที่ไม่ใช่ OFF
  let anyGroup = false;

  state.shifts.forEach(function (shift) {
    const people = [];
    state.employees.forEach(function (emp) {
      const en = day[emp.id];
      if (en && en.shiftId === shift.id) people.push({ emp: emp, en: en });
    });
    if (people.length === 0) return;
    anyGroup = true;
    if (!shift.isOff) working += people.length;

    html += '<div class="result-group">' +
      '<div class="result-head">' + chipHTML(shift, false) +
        ' <strong>' + escapeHtml(shiftLabel(shift)) + '</strong>' +
        ' <span class="count">— ' + people.length + ' คน</span></div>' +
      '<div class="result-names">' + people.map(function (p) {
        return escapeHtml(p.emp.fullname) + (p.en.ot ? ' (OT)' : '');
      }).join(', ') + '</div>' +
    '</div>';
  });

  // พนักงานที่ยังไม่ได้กำหนดผลัดในวันนั้น
  const unassigned = state.employees.filter(function (emp) {
    const en = day[emp.id];
    return !(en && getShift(en.shiftId));
  });
  if (unassigned.length > 0) {
    anyGroup = true;
    html += '<div class="result-group result-unassigned">' +
      '<div class="result-head"><strong>ยังไม่กำหนดผลัด</strong>' +
        ' <span class="count">— ' + unassigned.length + ' คน</span></div>' +
      '<div class="result-names">' + unassigned.map(function (emp) {
        return escapeHtml(emp.fullname);
      }).join(', ') + '</div>' +
    '</div>';
  }

  if (!anyGroup) html += '<div class="empty-state">ไม่มีข้อมูลของวันนี้</div>';
  result.innerHTML = html;
  total.textContent = 'รวมพนักงานทำงาน ' + working + ' / ' + state.employees.length + ' คน';
}

// เตรียมหน้าย้อนหลัง (ค่าเริ่มต้นเดือน + รายชื่อพนักงาน)
function initHistory() {
  const monthEl = $('#historyMonth');
  if (!monthEl.value) {
    const t = new Date();
    monthEl.value = t.getFullYear() + '-' + pad2(t.getMonth() + 1);
  }
  const sel = $('#historyEmployee');
  const prev = sel.value;
  sel.innerHTML = '<option value="">ทั้งหมด</option>' + state.employees.map(function (e) {
    return '<option value="' + escapeHtml(e.id) + '">' + escapeHtml(e.fullname) + '</option>';
  }).join('');
  sel.value = state.employees.some(function (e) { return e.id === prev; }) ? prev : '';
}

// โหลดตารางย้อนหลังของเดือนที่เลือก (เรียงจากวันล่าสุดไปเก่าสุด)
function loadHistory() {
  const val = $('#historyMonth').value;
  const box = $('#historyResult');
  if (!/^\d{4}-\d{2}$/.test(val)) {
    showToast('กรุณาเลือกเดือน');
    return;
  }
  const parts = val.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const daysInMonth = new Date(y, m, 0).getDate();
  const empFilter = $('#historyEmployee').value;

  let html = '';
  let workDays = 0;
  let otDays = 0;
  let offDays = 0;
  let found = false;

  for (let d = daysInMonth; d >= 1; d--) {
    const iso = y + '-' + pad2(m) + '-' + pad2(d);
    const day = state.schedule[iso];
    if (!day) continue;

    const items = [];
    state.employees.forEach(function (emp) {
      if (empFilter && emp.id !== empFilter) return;
      const en = day[emp.id];
      if (en) items.push({ emp: emp, en: en, shift: getShift(en.shiftId) });
    });
    if (items.length === 0) continue;
    found = true;

    let workers = 0;
    items.forEach(function (it) {
      if (it.shift && it.shift.isOff) {
        offDays++;
      } else {
        workers++;
        workDays++;
      }
      if (it.en.ot) otDays++;
    });

    html += '<div class="result-group">' +
      '<div class="result-head"><strong>' + escapeHtml(formatThaiDate(parseISO(iso))) + '</strong>' +
        (empFilter ? '' : ' <span class="count">— ทำงาน ' + workers + ' คน</span>') + '</div>' +
      '<ul class="history-list">' + items.map(function (it) {
        return '<li>' + chipHTML(it.shift, it.en.ot) +
          ' <span class="history-name">' + escapeHtml(it.emp.fullname) + '</span>' +
          (it.shift ? ' <small>' + escapeHtml(shiftLabel(it.shift) + ' ' + shiftTimeText(it.shift)) + '</small>' : '') +
        '</li>';
      }).join('') + '</ul>' +
    '</div>';
  }

  if (!found) {
    box.innerHTML = '<div class="empty-state">ไม่พบข้อมูลตารางงานในเดือนนี้</div>';
    return;
  }
  if (empFilter) {
    html = '<div class="history-summary">ทำงาน ' + workDays + ' วัน • OT ' + otDays +
      ' วัน • หยุด ' + offDays + ' วัน</div>' + html;
  }
  box.innerHTML = html;
}

// ผูกอีเวนต์ของหน้าสรุปและหน้าย้อนหลัง
function bindSummaryHistory() {
  $('#btnLoadSummary').addEventListener('click', loadSummary);
  $('#btnLoadHistory').addEventListener('click', loadHistory);
}


/* =====================================================================
 * 11. Backup (Import/Export)
 *     Export: JSON / CSV / XLSX     Import: .json (แทนที่ทั้งหมด) / .csv / .xlsx (รวมข้อมูล)
 * ===================================================================== */

// ดาวน์โหลดไฟล์จากข้อความ/Blob
function downloadFile(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

// ชื่อไฟล์สำรองพร้อมวันที่ เช่น wk_schedule_20260919.ext
function backupFileName(ext) {
  const t = new Date();
  return 'wk_schedule_' + t.getFullYear() + pad2(t.getMonth() + 1) + pad2(t.getDate()) + '.' + ext;
}

// สร้างแถวข้อมูลดิบ (1 แถว = 1 พนักงาน - 1 วัน - 1 ผลัด)
function buildScheduleRows() {
  const rows = [];
  Object.keys(state.schedule).sort().forEach(function (iso) {
    state.employees.forEach(function (emp) {
      const en = state.schedule[iso][emp.id];
      if (!en) return;
      const shift = getShift(en.shiftId);
      if (!shift) return;
      rows.push({
        date: iso,
        employee_id: emp.id,
        employee_code: emp.code,
        employee_name: emp.fullname,
        position: emp.position,
        phone: emp.phone,
        shift_id: shift.id,
        shift_code: shift.code,
        shift_name: shift.name,
        start: shift.startTime,
        end: shift.endTime,
        ot: en.ot ? 1 : 0
      });
    });
  });
  return rows;
}

// ---------- Export ----------

function exportJSON() {
  const payload = {
    employees: state.employees,
    shifts: state.shifts,
    schedule: state.schedule,
    exportedAt: new Date().toISOString()
  };
  downloadFile(backupFileName('json'), JSON.stringify(payload, null, 2), 'application/json');
  showToast('ส่งออก JSON แล้ว');
}

// escape ค่าสำหรับ CSV
function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportCSV() {
  const header = ['date', 'employee_code', 'employee_name', 'position', 'phone',
    'shift_code', 'shift_name', 'start', 'end', 'ot'];
  const rows = buildScheduleRows();
  const lines = [header.join(',')];
  rows.forEach(function (r) {
    lines.push(header.map(function (k) { return csvEscape(r[k]); }).join(','));
  });
  // ใส่ BOM เพื่อให้ Excel อ่านภาษาไทยได้ถูกต้อง
  downloadFile(backupFileName('csv'), '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  showToast('ส่งออก CSV แล้ว (' + rows.length + ' แถว)');
}

function exportXLSX() {
  if (typeof XLSX === 'undefined') {
    showToast('ไม่พบไลบรารี SheetJS (ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อโหลด)');
    return;
  }
  const empRows = state.employees.map(function (e) {
    return { id: e.id, code: e.code, fullname: e.fullname, position: e.position, phone: e.phone };
  });
  const shiftRows = state.shifts.map(function (s) {
    return {
      id: s.id, code: s.code, name: s.name, startTime: s.startTime, endTime: s.endTime,
      color: s.color, overnight: s.overnight ? 1 : 0, otUntil: s.otUntil || '', isOff: s.isOff ? 1 : 0
    };
  });
  const schedRows = buildScheduleRows();

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empRows, {
    header: ['id', 'code', 'fullname', 'position', 'phone']
  }), 'Employees');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shiftRows, {
    header: ['id', 'code', 'name', 'startTime', 'endTime', 'color', 'overnight', 'otUntil', 'isOff']
  }), 'Shifts');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(schedRows, {
    header: ['date', 'employee_id', 'employee_code', 'employee_name', 'position', 'phone',
      'shift_id', 'shift_code', 'shift_name', 'start', 'end', 'ot']
  }), 'Schedule');
  XLSX.writeFile(wb, backupFileName('xlsx'));
  showToast('ส่งออก Excel แล้ว');
}

// ---------- Import: ตัวช่วยอ่านไฟล์ ----------

function readFileText(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(String(reader.result)); };
    reader.onerror = function () { reject(new Error('อ่านไฟล์ไม่สำเร็จ')); };
    reader.readAsText(file, 'utf-8');
  });
}

function readFileBuffer(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(new Error('อ่านไฟล์ไม่สำเร็จ')); };
    reader.readAsArrayBuffer(file);
  });
}

// เดาตัวคั่นของ CSV จากบรรทัดแรก (, ; หรือ tab)
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const counts = [
    { d: ',', n: (firstLine.match(/,/g) || []).length },
    { d: ';', n: (firstLine.match(/;/g) || []).length },
    { d: '\t', n: (firstLine.match(/\t/g) || []).length }
  ];
  counts.sort(function (a, b) { return b.n - a.n; });
  return counts[0].n > 0 ? counts[0].d : ',';
}

// แปลงข้อความ CSV เป็นตาราง (รองรับ "" ในเครื่องหมายคำพูด และขึ้นบรรทัดใหม่ในช่อง)
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const delim = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ทำให้ชื่อคอลัมน์เป็นรูปแบบเดียวกัน เช่น "Employee_Code" → "employeecode"
function normalizeKey(k) {
  return String(k).trim().toLowerCase().replace(/[\s_\-]+/g, '');
}
function normalizeKeys(obj) {
  const out = {};
  Object.keys(obj).forEach(function (k) { out[normalizeKey(k)] = obj[k]; });
  return out;
}

// แปลงค่าให้เป็นข้อความที่ตัดช่องว่างแล้ว
function str(v) {
  return String(v === null || v === undefined ? '' : v).trim();
}

// ค่าแรกที่ไม่ใช่ undefined จากหลายชื่อคอลัมน์
function pickField(row, names) {
  for (let i = 0; i < names.length; i++) {
    if (row[names[i]] !== undefined) return row[names[i]];
  }
  return '';
}

// แถวว่างทั้งหมดหรือไม่
function isBlankRow(obj) {
  return Object.keys(obj).every(function (k) { return str(obj[k]) === ''; });
}

// แปลงแถวข้อมูล (CSV/XLSX) เป็นรายการตารางงาน
function schedRowFromObj(r) {
  return {
    date: normalizeDate(pickField(r, ['date'])),
    empId: str(pickField(r, ['employeeid'])),
    empCode: str(pickField(r, ['employeecode'])),
    empName: str(pickField(r, ['employeename', 'fullname', 'name'])),
    position: str(pickField(r, ['position'])),
    phone: str(pickField(r, ['phone'])),
    shiftId: str(pickField(r, ['shiftid'])),
    shiftCode: str(pickField(r, ['shiftcode'])),
    shiftName: str(pickField(r, ['shiftname'])),
    start: normalizeTime(pickField(r, ['start', 'starttime'])),
    end: normalizeTime(pickField(r, ['end', 'endtime'])),
    ot: parseBool(pickField(r, ['ot']))
  };
}

// ---------- Import: รวมข้อมูล (merge) ----------

// หาพนักงานเดิมด้วย code หรือ fullname
function findEmployeeByKey(code, name) {
  const c = str(code).toLowerCase();
  const n = str(name).toLowerCase();
  if (c) {
    const byCode = state.employees.find(function (e) {
      return e.code && e.code.toLowerCase() === c;
    });
    if (byCode) return byCode;
  }
  if (n) {
    return state.employees.find(function (e) { return e.fullname.toLowerCase() === n; }) || null;
  }
  return null;
}

// หาผลัดเดิมด้วย code
function findShiftByCode(code) {
  const c = str(code).toLowerCase();
  if (!c) return null;
  return state.shifts.find(function (s) { return s.code.toLowerCase() === c; }) || null;
}

// หาพนักงานเดิม ถ้าไม่มีให้สร้างใหม่ (เติมเฉพาะช่องที่ว่าง ไม่ทับของเดิม)
function findOrCreateEmployee(r, stats) {
  if (!str(r.code) && !str(r.fullname)) return null;
  const found = findEmployeeByKey(r.code, r.fullname);
  if (found) {
    if (!found.code && str(r.code)) found.code = str(r.code);
    if (!found.position && str(r.position)) found.position = str(r.position);
    if (!found.phone && str(r.phone)) found.phone = str(r.phone);
    return found;
  }
  const emp = {
    id: uid(),
    code: str(r.code),
    fullname: str(r.fullname) || str(r.code),
    position: str(r.position),
    phone: str(r.phone)
  };
  state.employees.push(emp);
  stats.addedEmp++;
  return emp;
}

// หาผลัดเดิม ถ้าไม่มีให้สร้างใหม่ (สีเลือกจากชุดสีสำรอง)
function findOrCreateShift(r, stats) {
  const code = str(r.code);
  if (!code) return null;
  const found = findShiftByCode(code);
  if (found) return found;

  const start = normalizeTime(r.startTime);
  const end = normalizeTime(r.endTime);
  const isOff = !!r.isOff || code.toUpperCase() === 'OFF' || (!start && !end);
  const color = /^#[0-9a-fA-F]{6}$/.test(str(r.color))
    ? str(r.color)
    : IMPORT_COLOR_PALETTE[state.shifts.length % IMPORT_COLOR_PALETTE.length];
  const shift = {
    id: uid(),
    code: code,
    name: str(r.name),
    startTime: isOff ? '' : start,
    endTime: isOff ? '' : end,
    color: isOff ? '#95a5a6' : color,
    overnight: isOff ? false : (!!r.overnight || !!(start && end && end < start)),
    otUntil: isOff ? null : (normalizeTime(r.otUntil) || null),
    isOff: isOff
  };
  state.shifts.push(shift);
  stats.addedShift++;
  return shift;
}

// รวมข้อมูลนำเข้า (พนักงาน match ด้วย code หรือ fullname, ผลัด match ด้วย code)
function mergeImported(empRows, shiftRows, schedRows) {
  const stats = { addedEmp: 0, addedShift: 0, entries: 0, skipped: 0 };
  const empIdMap = {};     // id ในไฟล์ → id ในเครื่อง
  const shiftIdMap = {};

  empRows.forEach(function (r) {
    const emp = findOrCreateEmployee(r, stats);
    if (emp && r.id) empIdMap[r.id] = emp.id;
  });

  shiftRows.forEach(function (r) {
    const shift = findOrCreateShift(r, stats);
    if (shift && r.id) shiftIdMap[r.id] = shift.id;
  });

  schedRows.forEach(function (r) {
    if (!isValidISO(r.date)) {
      stats.skipped++;
      return;
    }
    // หาพนักงาน: จาก id ในไฟล์ก่อน แล้วค่อยใช้ code/ชื่อ
    let emp = r.empId && empIdMap[r.empId] ? getEmployee(empIdMap[r.empId]) : null;
    if (!emp) {
      emp = findOrCreateEmployee({
        code: r.empCode, fullname: r.empName, position: r.position, phone: r.phone
      }, stats);
    }
    // หาผลัด: จาก id ในไฟล์ก่อน แล้วค่อยใช้ code
    let shift = r.shiftId && shiftIdMap[r.shiftId] ? getShift(shiftIdMap[r.shiftId]) : null;
    if (!shift) {
      shift = findOrCreateShift({
        code: r.shiftCode, name: r.shiftName, startTime: r.start, endTime: r.end
      }, stats);
    }
    if (!emp || !shift) {
      stats.skipped++;
      return;
    }
    setEntry(r.date, emp.id, { shiftId: shift.id, ot: !!r.ot });
    stats.entries++;
  });

  return stats;
}

// ข้อความสรุปผลการรวมข้อมูล
function mergeMessage(stats) {
  let msg = 'เพิ่มพนักงานใหม่ ' + stats.addedEmp + ' คน, เพิ่มผลัดใหม่ ' + stats.addedShift +
    ' ผลัด, บันทึกตารางงาน ' + stats.entries + ' รายการ';
  if (stats.skipped > 0) msg += ', ข้ามข้อมูลที่ไม่ครบ ' + stats.skipped + ' แถว';
  return msg;
}

// ---------- Import: แต่ละชนิดไฟล์ ----------

// JSON: แทนที่ข้อมูลทั้งหมด (คืน null ถ้าผู้ใช้ยกเลิก)
function importJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error('ไฟล์ JSON ไม่ถูกต้อง');
  }
  if (!data || !Array.isArray(data.employees) || !Array.isArray(data.shifts) ||
      !data.schedule || typeof data.schedule !== 'object' || Array.isArray(data.schedule)) {
    throw new Error('โครงสร้างไฟล์ไม่ถูกต้อง (ต้องมี employees, shifts, schedule)');
  }
  if (!confirm('การนำเข้า JSON จะแทนที่ข้อมูลทั้งหมดในเครื่อง\nต้องการดำเนินการต่อหรือไม่?')) {
    return null;
  }
  const clean = sanitizeAll(data.employees, data.shifts, data.schedule);
  state.employees = clean.employees;
  state.shifts = clean.shifts;
  state.schedule = clean.schedule;

  let msg = 'พนักงาน ' + clean.employees.length + ' คน, ผลัด ' + clean.shifts.length + ' ผลัด, ' +
    'ตารางงาน ' + countScheduleWhere(function () { return true; }) + ' รายการ';
  if (clean.dropped > 0) msg += ' (ข้ามข้อมูลที่อ้างอิงไม่ถูกต้อง ' + clean.dropped + ' รายการ)';
  return msg;
}

// CSV: parse แล้ว merge
function importCSV(text) {
  const table = parseCSV(text);
  if (table.length < 2) throw new Error('ไฟล์ CSV ไม่มีข้อมูล');
  const keys = table[0].map(normalizeKey);
  const hasCol = function (k) { return keys.indexOf(k) !== -1; };
  if (!hasCol('date') || !hasCol('shiftcode') || (!hasCol('employeecode') && !hasCol('employeename'))) {
    throw new Error('CSV ต้องมีคอลัมน์ date, employee_code หรือ employee_name, และ shift_code');
  }
  const schedRows = [];
  for (let i = 1; i < table.length; i++) {
    const obj = {};
    keys.forEach(function (k, idx) { obj[k] = table[i][idx] === undefined ? '' : table[i][idx]; });
    if (isBlankRow(obj)) continue;
    schedRows.push(schedRowFromObj(obj));
  }
  return mergeMessage(mergeImported([], [], schedRows));
}

// XLSX: อ่าน 3 sheet (Employees, Shifts, Schedule) แล้ว merge
function importXLSX(buffer) {
  if (typeof XLSX === 'undefined') {
    throw new Error('ไม่พบไลบรารี SheetJS (ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อโหลด)');
  }
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'array' });
  } catch (err) {
    throw new Error('อ่านไฟล์ Excel ไม่สำเร็จ');
  }
  const findSheet = function (name) {
    const found = wb.SheetNames.find(function (n) { return n.trim().toLowerCase() === name; });
    return found ? wb.Sheets[found] : null;
  };
  const wsE = findSheet('employees');
  const wsS = findSheet('shifts');
  const wsC = findSheet('schedule');
  if (!wsE && !wsS && !wsC) throw new Error('ไม่พบชีต Employees / Shifts / Schedule');

  const toObjs = function (ws) {
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
      .map(normalizeKeys)
      .filter(function (o) { return !isBlankRow(o); });
  };

  const empRows = toObjs(wsE).map(function (r) {
    return {
      id: str(pickField(r, ['id'])),
      code: str(pickField(r, ['code', 'employeecode'])),
      fullname: str(pickField(r, ['fullname', 'employeename', 'name'])),
      position: str(pickField(r, ['position'])),
      phone: str(pickField(r, ['phone']))
    };
  });
  const shiftRows = toObjs(wsS).map(function (r) {
    return {
      id: str(pickField(r, ['id'])),
      code: str(pickField(r, ['code', 'shiftcode'])),
      name: str(pickField(r, ['name', 'shiftname'])),
      startTime: normalizeTime(pickField(r, ['starttime', 'start'])),
      endTime: normalizeTime(pickField(r, ['endtime', 'end'])),
      color: str(pickField(r, ['color'])),
      overnight: parseBool(pickField(r, ['overnight'])),
      otUntil: normalizeTime(pickField(r, ['otuntil'])),
      isOff: parseBool(pickField(r, ['isoff']))
    };
  });
  const schedRows = toObjs(wsC).map(schedRowFromObj);

  return mergeMessage(mergeImported(empRows, shiftRows, schedRows));
}

// วาดหน้าต่าง ๆ ใหม่หลังนำเข้าข้อมูล
function refreshAfterImport() {
  renderSchedule({ resetScroll: true });
  renderEmployees();
  renderShifts();
  initHistory();
}

// จัดการไฟล์ที่เลือกนำเข้า
async function handleImportFile(file) {
  const status = $('#importStatus');
  status.className = 'import-status';
  status.textContent = 'กำลังนำเข้า...';

  // เก็บสำเนาไว้ย้อนกลับ ถ้านำเข้าแล้วเกิดข้อผิดพลาด
  const snapshot = JSON.stringify({
    employees: state.employees, shifts: state.shifts, schedule: state.schedule
  });

  try {
    const ext = file.name.split('.').pop().toLowerCase();
    let msg;
    if (ext === 'json') {
      msg = importJSON(await readFileText(file));
      if (msg === null) {
        status.textContent = 'ยกเลิกการนำเข้า';
        return;
      }
    } else if (ext === 'csv') {
      msg = importCSV(await readFileText(file));
    } else if (ext === 'xlsx' || ext === 'xls') {
      msg = importXLSX(await readFileBuffer(file));
    } else {
      throw new Error('รองรับเฉพาะไฟล์ .json / .csv / .xlsx');
    }
    saveAll();
    refreshAfterImport();
    status.classList.add('ok');
    status.textContent = 'นำเข้าสำเร็จ: ' + msg;
    alert('นำเข้าสำเร็จ\n' + msg);
  } catch (err) {
    const old = JSON.parse(snapshot);
    state.employees = old.employees;
    state.shifts = old.shifts;
    state.schedule = old.schedule;
    status.classList.add('err');
    status.textContent = 'ผิดพลาด: ' + err.message;
    alert('ผิดพลาด: ' + err.message);
  }
}

// ผูกอีเวนต์ของหน้าสำรอง/นำเข้า
function bindBackup() {
  $('#btnExportJSON').addEventListener('click', exportJSON);
  $('#btnExportCSV').addEventListener('click', exportCSV);
  $('#btnExportXLSX').addEventListener('click', exportXLSX);
  $('#importFile').addEventListener('change', function (e) {
    const file = e.target.files && e.target.files[0];
    if (file) handleImportFile(file);
    e.target.value = '';   // ให้เลือกไฟล์เดิมซ้ำได้
  });
}


/* =====================================================================
 * 12. Init
 *     เริ่มต้นแอป: โหลดข้อมูล ผูกอีเวนต์ และแสดงหน้าตารางงาน
 * ===================================================================== */

// ผูกอีเวนต์ทั่วไปของ modal (ปิดเมื่อกดพื้นหลัง/ปุ่มยกเลิก/กด Esc)
function bindModals() {
  document.addEventListener('click', function (e) {
    const closer = e.target.closest('[data-close-modal]');
    if (!closer) return;
    const modal = closer.closest('.modal');
    if (modal) closeModal(modal);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeAllModals();
      setNavOpen(false);
    }
  });
  // เอาเครื่องหมายช่องกรอกผิดออกเมื่อเริ่มพิมพ์ใหม่
  document.addEventListener('input', function (e) {
    if (e.target.classList) e.target.classList.remove('invalid');
  });
}

function init() {
  loadAll();

  bindNavigation();
  bindToolbar();
  bindScheduleClicks();
  bindAssignModal();
  bindEmployees();
  bindShifts();
  bindSummaryHistory();
  bindBackup();
  bindModals();

  $('#summaryDate').value = toISO(new Date());
  showPage('schedule');
}

document.addEventListener('DOMContentLoaded', init);

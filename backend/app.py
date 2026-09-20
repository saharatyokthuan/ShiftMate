# -*- coding: utf-8 -*-
"""app.py — Flask API"""
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import uuid
from datetime import datetime

from database import db, init_db, rows_to_list

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

app = Flask(__name__, static_folder=ROOT, static_url_path='')
CORS(app)


def uid(prefix):
    return prefix + "_" + uuid.uuid4().hex[:10]


@app.route('/')
def index():
    return send_from_directory(ROOT, 'index.html')


# ---------- EMPLOYEES ----------
@app.get('/api/employees')
def list_employees():
    with db() as conn:
        rows = conn.execute("SELECT * FROM employees ORDER BY fullname").fetchall()
    return jsonify(rows_to_list(rows))


@app.post('/api/employees')
def create_employee():
    data = request.get_json() or {}
    if not data.get('fullname') or not data.get('position') or not data.get('phone'):
        return jsonify({'error': 'ต้องกรอก ชื่อ, ตำแหน่ง, เบอร์โทร'}), 400
    emp_id = data.get('id') or uid('emp')
    with db() as conn:
        conn.execute("""
            INSERT INTO employees (id, code, fullname, position, phone)
            VALUES (?, ?, ?, ?, ?)
        """, (emp_id, data.get('code', ''), data['fullname'], data['position'], data['phone']))
    return jsonify({'id': emp_id, **data}), 201


@app.put('/api/employees/<emp_id>')
def update_employee(emp_id):
    data = request.get_json() or {}
    with db() as conn:
        cur = conn.execute("""
            UPDATE employees SET code=?, fullname=?, position=?, phone=? WHERE id=?
        """, (data.get('code', ''), data.get('fullname', ''),
              data.get('position', ''), data.get('phone', ''), emp_id))
        if cur.rowcount == 0:
            return jsonify({'error': 'ไม่พบพนักงาน'}), 404
    return jsonify({'id': emp_id, **data})


@app.delete('/api/employees/<emp_id>')
def delete_employee(emp_id):
    with db() as conn:
        cur = conn.execute("DELETE FROM employees WHERE id=?", (emp_id,))
        if cur.rowcount == 0:
            return jsonify({'error': 'ไม่พบพนักงาน'}), 404
    return jsonify({'ok': True})


# ---------- SHIFTS ----------
@app.get('/api/shifts')
def list_shifts():
    with db() as conn:
        rows = conn.execute("SELECT * FROM shifts ORDER BY code").fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d['overnight'] = bool(d['overnight'])
        d['is_off'] = bool(d['is_off'])
        out.append(d)
    return jsonify(out)


@app.post('/api/shifts')
def create_shift():
    data = request.get_json() or {}
    if not data.get('code'):
        return jsonify({'error': 'ต้องมีรหัสผลัด'}), 400
    sh_id = data.get('id') or uid('shift')
    with db() as conn:
        conn.execute("""
            INSERT INTO shifts (id, code, name, start_time, end_time,
                                color, overnight, ot_until, is_off)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (sh_id, data['code'], data.get('name', ''),
              data.get('start_time', ''), data.get('end_time', ''),
              data.get('color', '#3498db'),
              1 if data.get('overnight') else 0,
              data.get('ot_until'),
              1 if data.get('is_off') else 0))
    return jsonify({'id': sh_id, **data}), 201


@app.put('/api/shifts/<sh_id>')
def update_shift(sh_id):
    data = request.get_json() or {}
    with db() as conn:
        cur = conn.execute("""
            UPDATE shifts SET code=?, name=?, start_time=?, end_time=?,
                              color=?, overnight=?, ot_until=?, is_off=?
            WHERE id=?
        """, (data.get('code', ''), data.get('name', ''),
              data.get('start_time', ''), data.get('end_time', ''),
              data.get('color', '#3498db'),
              1 if data.get('overnight') else 0,
              data.get('ot_until'),
              1 if data.get('is_off') else 0,
              sh_id))
        if cur.rowcount == 0:
            return jsonify({'error': 'ไม่พบผลัด'}), 404
    return jsonify({'id': sh_id, **data})


@app.delete('/api/shifts/<sh_id>')
def delete_shift(sh_id):
    with db() as conn:
        cur = conn.execute("DELETE FROM shifts WHERE id=?", (sh_id,))
        if cur.rowcount == 0:
            return jsonify({'error': 'ไม่พบผลัด'}), 404
    return jsonify({'ok': True})


# ---------- SCHEDULE ----------
@app.get('/api/schedule')
def list_schedule():
    date = request.args.get('date')
    with db() as conn:
        if date:
            rows = conn.execute("SELECT * FROM schedule WHERE date=?", (date,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM schedule").fetchall()
    out = {}
    for r in rows:
        d = dict(r)
        out.setdefault(d['date'], {})[d['emp_id']] = {
            'shiftId': d['shift_id'],
            'ot': bool(d['ot'])
        }
    return jsonify(out)


@app.put('/api/schedule/<date>/<emp_id>')
def set_schedule(date, emp_id):
    data = request.get_json() or {}
    shift_id = data.get('shiftId')
    ot = 1 if data.get('ot') else 0
    with db() as conn:
        if not shift_id:
            conn.execute("DELETE FROM schedule WHERE date=? AND emp_id=?", (date, emp_id))
        else:
            conn.execute("""
                INSERT INTO schedule (date, emp_id, shift_id, ot)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(date, emp_id) DO UPDATE SET
                    shift_id=excluded.shift_id,
                    ot=excluded.ot
            """, (date, emp_id, shift_id, ot))
    return jsonify({'date': date, 'emp_id': emp_id, 'shiftId': shift_id, 'ot': bool(ot)})


@app.delete('/api/schedule/<date>/<emp_id>')
def delete_schedule(date, emp_id):
    with db() as conn:
        conn.execute("DELETE FROM schedule WHERE date=? AND emp_id=?", (date, emp_id))
    return jsonify({'ok': True})


# ---------- BACKUP ----------
@app.get('/api/backup')
def backup():
    with db() as conn:
        employees = rows_to_list(conn.execute("SELECT * FROM employees").fetchall())
        shifts    = rows_to_list(conn.execute("SELECT * FROM shifts").fetchall())
        sched     = rows_to_list(conn.execute("SELECT * FROM schedule").fetchall())
    schedule = {}
    for r in sched:
        schedule.setdefault(r['date'], {})[r['emp_id']] = {
            'shiftId': r['shift_id'],
            'ot': bool(r['ot'])
        }
    return jsonify({
        'employees': employees,
        'shifts': shifts,
        'schedule': schedule,
        'exportedAt': datetime.now().isoformat(),
        'version': 1
    })


@app.post('/api/restore')
def restore():
    data = request.get_json() or {}
    if not isinstance(data.get('employees'), list) or not isinstance(data.get('shifts'), list):
        return jsonify({'error': 'รูปแบบไม่ถูกต้อง'}), 400
    with db() as conn:
        conn.execute("DELETE FROM schedule")
        conn.execute("DELETE FROM employees")
        conn.execute("DELETE FROM shifts")
        for e in data['employees']:
            conn.execute("""
                INSERT INTO employees (id, code, fullname, position, phone)
                VALUES (?, ?, ?, ?, ?)
            """, (e.get('id') or uid('emp'), e.get('code', ''),
                  e['fullname'], e.get('position', ''), e.get('phone', '')))
        for s in data['shifts']:
            conn.execute("""
                INSERT INTO shifts (id, code, name, start_time, end_time,
                                    color, overnight, ot_until, is_off)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (s.get('id') or uid('shift'), s['code'], s.get('name', ''),
                  s.get('start_time', ''), s.get('end_time', ''),
                  s.get('color', '#3498db'),
                  1 if s.get('overnight') else 0,
                  s.get('ot_until'),
                  1 if s.get('is_off') else 0))
        for date, day in (data.get('schedule') or {}).items():
            for emp_id, entry in day.items():
                conn.execute("""
                    INSERT INTO schedule (date, emp_id, shift_id, ot)
                    VALUES (?, ?, ?, ?)
                """, (date, emp_id, entry['shiftId'], 1 if entry.get('ot') else 0))
    return jsonify({'ok': True})


if __name__ == '__main__':
    init_db()
    print("=" * 55)
    print("Flask Backend — ระบบจัดตารางงาน")
    print("=" * 55)
    print("  http://localhost:5000")
    print("  API: /api/employees | /api/shifts | /api/schedule")
    print("=" * 55)
    app.run(host='0.0.0.0', port=5000, debug=True)

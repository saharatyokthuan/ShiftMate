#!/usr/bin/env python3
"""
convert.py — แปลงข้อมูลตารางงานระหว่าง JSON ↔ CSV
ใช้: python convert.py input.json output.csv
     python convert.py input.csv  output.json
"""
import sys
import json
import csv
import os


def json_to_csv(json_path, csv_path):
    """JSON → CSV (1 แถว = 1 พนง.×1 วัน×1 ผลัด)"""
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    employees = {e['id']: e for e in data.get('employees', [])}
    shifts    = {s['id']: s for s in data.get('shifts', [])}
    schedule  = data.get('schedule', {})

    rows = [[
        'date', 'employee_code', 'employee_name', 'position', 'phone',
        'shift_code', 'shift_name', 'start', 'end', 'ot'
    ]]

    for date in sorted(schedule.keys()):
        for emp_id, entry in schedule[date].items():
            emp = employees.get(emp_id)
            sh  = shifts.get(entry.get('shiftId'))
            if not emp or not sh:
                continue
            rows.append([
                date,
                emp.get('code', ''),
                emp.get('fullname', ''),
                emp.get('position', ''),
                emp.get('phone', ''),
                sh.get('code', ''),
                sh.get('name', ''),
                sh.get('start_time', sh.get('startTime', '')),
                sh.get('end_time',   sh.get('endTime', '')),
                'TRUE' if entry.get('ot') else 'FALSE',
            ])

    with open(csv_path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerows(rows)

    print(f"✅ {json_path}  →  {csv_path}")
    print(f"   {len(rows) - 1} แถว")


def csv_to_json(csv_path, json_path):
    """CSV → JSON (โครงสร้างเดียวกับ localStorage)"""
    employees = {}
    shifts    = {}
    schedule  = {}

    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            date     = row.get('date', '').strip()
            emp_code = row.get('employee_code', '').strip()
            emp_name = row.get('employee_name', '').strip()
            sh_code  = row.get('shift_code', '').strip()
            if not (date and emp_name and sh_code):
                continue

            # employee
            emp_key = emp_code or emp_name
            if emp_key not in employees:
                emp_id = f"emp_{len(employees) + 1:04d}"
                employees[emp_key] = {
                    'id': emp_id,
                    'code': emp_code,
                    'fullname': emp_name,
                    'position': row.get('position', ''),
                    'phone': row.get('phone', ''),
                }

            # shift
            if sh_code not in shifts:
                sh_id = f"shift_{len(shifts) + 1:04d}"
                shifts[sh_code] = {
                    'id': sh_id,
                    'code': sh_code,
                    'name': row.get('shift_name', ''),
                    'start_time': row.get('start', ''),
                    'end_time': row.get('end', ''),
                    'color': '#3498db',
                    'overnight': False,
                    'ot_until': None,
                    'is_off': sh_code.upper() == 'OFF',
                }

            # schedule
            schedule.setdefault(date, {})[employees[emp_key]['id']] = {
                'shiftId': shifts[sh_code]['id'],
                'ot': row.get('ot', '').upper() == 'TRUE',
            }

    out = {
        'employees': list(employees.values()),
        'shifts': list(shifts.values()),
        'schedule': schedule,
        'version': 1,
    }

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"✅ {csv_path}  →  {json_path}")
    print(f"   {len(out['employees'])} พนักงาน, {len(out['shifts'])} ผลัด, "
          f"{len(out['schedule'])} วัน")


def main():
    if len(sys.argv) != 3:
        print("ใช้: python convert.py <input> <output>")
        print("ตัวอย่าง:")
        print("  python convert.py backup.json backup.csv")
        print("  python convert.py backup.csv  backup.json")
        sys.exit(1)

    src, dst = sys.argv[1], sys.argv[2]
    if not os.path.exists(src):
        print(f"❌ ไม่พบไฟล์: {src}")
        sys.exit(1)

    src_ext = os.path.splitext(src)[1].lower()
    dst_ext = os.path.splitext(dst)[1].lower()

    if src_ext == '.json' and dst_ext == '.csv':
        json_to_csv(src, dst)
    elif src_ext == '.csv' and dst_ext == '.json':
        csv_to_json(src, dst)
    else:
        print(f"❌ ไม่รองรับการแปลง {src_ext} → {dst_ext}")
        sys.exit(1)


if __name__ == '__main__':
    main()
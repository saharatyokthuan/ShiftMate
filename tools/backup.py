#!/usr/bin/env python3
"""
backup.py — สำรอง/กู้คืนข้อมูลจาก API หรือไฟล์
ใช้:
  python backup.py export                # ดึงจาก API → ไฟล์
  python backup.py import backup.json    # ส่งเข้า API
  python backup.py list                  # แสดงไฟล์สำรองทั้งหมด
"""
import sys
import os
import json
import urllib.request
from datetime import datetime

API = 'http://localhost:5000/api'
BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backups')


def http_get(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read().decode('utf-8'))


def http_post(url, data):
    body = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(
        url, data=body,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def do_export():
    print("📥 ดึงข้อมูลจาก API...")
    try:
        data = http_get(f'{API}/backup')
    except Exception as e:
        print(f"❌ เชื่อมต่อ API ไม่ได้: {e}")
        print("   ตรวจสอบว่า backend/app.py รันอยู่หรือไม่")
        sys.exit(1)

    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = os.path.join(BACKUP_DIR, f'backup_{ts}.json')

    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    size = os.path.getsize(filename)
    print(f"✅ สำรองแล้ว: {filename}")
    print(f"   ขนาด: {size:,} bytes")
    print(f"   พนักงาน: {len(data.get('employees', []))} คน")
    print(f"   ผลัด: {len(data.get('shifts', []))} รายการ")
    print(f"   ตารางงาน: {len(data.get('schedule', {}))} วัน")


def do_import(path):
    if not os.path.exists(path):
        print(f"❌ ไม่พบไฟล์: {path}")
        sys.exit(1)

    print(f"📤 อ่านไฟล์: {path}")
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print("⚠️  ข้อมูลเดิมจะถูกแทนที่ทั้งหมด")
    ans = input("   ยืนยัน? (yes/no): ").strip().lower()
    if ans != 'yes':
        print("❌ ยกเลิก")
        sys.exit(0)

    print("📡 ส่งข้อมูลเข้า API...")
    try:
        result = http_post(f'{API}/restore', data)
        if result.get('ok'):
            print("✅ กู้คืนสำเร็จ")
        else:
            print(f"❌ ผิดพลาด: {result}")
    except Exception as e:
        print(f"❌ เชื่อมต่อ API ไม่ได้: {e}")
        sys.exit(1)


def do_list():
    if not os.path.isdir(BACKUP_DIR):
        print("📁 ยังไม่มีไฟล์สำรอง")
        return

    files = sorted(
        [f for f in os.listdir(BACKUP_DIR) if f.startswith('backup_') and f.endswith('.json')],
        reverse=True
    )
    if not files:
        print("📁 ยังไม่มีไฟล์สำรอง")
        return

    print(f"📁 ไฟล์สำรองใน {BACKUP_DIR}:")
    print()
    for f in files:
        p = os.path.join(BACKUP_DIR, f)
        size = os.path.getsize(p)
        mtime = datetime.fromtimestamp(os.path.getmtime(p)).strftime('%Y-%m-%d %H:%M:%S')
        print(f"  • {f}   ({size:,} bytes)   {mtime}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1].lower()
    if cmd == 'export':
        do_export()
    elif cmd == 'import':
        if len(sys.argv) < 3:
            print("ใช้: python backup.py import <file.json>")
            sys.exit(1)
        do_import(sys.argv[2])
    elif cmd == 'list':
        do_list()
    else:
        print(f"❌ คำสั่งไม่รู้จัก: {cmd}")
        print(__doc__)


if __name__ == '__main__':
    main()
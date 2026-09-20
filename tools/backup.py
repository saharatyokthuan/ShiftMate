#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
backup.py — สำรอง/กู้คืนข้อมูลจาก API
ใช้:
  python backup.py export
  python backup.py import backup.json
  python backup.py list
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
    print("[*] Fetching from API...")
    try:
        data = http_get(API + '/backup')
    except Exception as e:
        print("[X] API error: " + str(e))
        print("    ตรวจสอบว่า backend/app.py รันอยู่หรือไม่")
        sys.exit(1)
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = os.path.join(BACKUP_DIR, 'backup_' + ts + '.json')
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    size = os.path.getsize(filename)
    print("[OK] " + filename)
    print("     size: " + str(size) + " bytes")
    print("     employees: " + str(len(data.get('employees', []))))
    print("     shifts:    " + str(len(data.get('shifts', []))))
    print("     days:      " + str(len(data.get('schedule', {}))))


def do_import(path):
    if not os.path.exists(path):
        print("[X] File not found: " + path)
        sys.exit(1)
    print("[*] Reading: " + path)
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    print("[!] ข้อมูลเดิมจะถูกแทนที่ทั้งหมด")
    ans = input("    ยืนยัน? (yes/no): ").strip().lower()
    if ans != 'yes':
        print("[X] ยกเลิก")
        sys.exit(0)
    print("[*] Sending to API...")
    try:
        result = http_post(API + '/restore', data)
        if result.get('ok'):
            print("[OK] Restore complete")
        else:
            print("[X] Failed: " + str(result))
    except Exception as e:
        print("[X] API error: " + str(e))
        sys.exit(1)


def do_list():
    if not os.path.isdir(BACKUP_DIR):
        print("No backups")
        return
    files = sorted(
        [f for f in os.listdir(BACKUP_DIR) if f.startswith('backup_') and f.endswith('.json')],
        reverse=True
    )
    if not files:
        print("No backups")
        return
    print("Backups in " + BACKUP_DIR + ":")
    print()
    for f in files:
        p = os.path.join(BACKUP_DIR, f)
        size = os.path.getsize(p)
        mtime = datetime.fromtimestamp(os.path.getmtime(p)).strftime('%Y-%m-%d %H:%M:%S')
        print("  - " + f + "  (" + str(size) + " bytes)  " + mtime)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cmd = sys.argv[1].lower()
    if cmd == 'export':
        do_export()
    elif cmd == 'import':
        if len(sys.argv) < 3:
            print("Usage: python backup.py import <file.json>")
            sys.exit(1)
        do_import(sys.argv[2])
    elif cmd == 'list':
        do_list()
    else:
        print("[X] Unknown command: " + cmd)
        print(__doc__)


if __name__ == '__main__':
    main()

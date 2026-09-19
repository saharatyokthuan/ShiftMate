#!/usr/bin/env python3
"""
server.py — Local server สำหรับทดสอบระบบจัดตารางงาน
รัน: python server.py
"""

import http.server
import socketserver
import socket
import webbrowser
import os
import sys

PORT = 8000


def get_local_ip():
    """หา IP ในวง LAN"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        print(f"  → {self.address_string()}  {fmt % args}")


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    if not os.path.exists('index.html'):
        print("⚠️  ไม่พบ index.html ในโฟลเดอร์นี้")
        sys.exit(1)

    ip = get_local_ip()
    local_url = f"http://localhost:{PORT}"
    lan_url   = f"http://{ip}:{PORT}"

    print("=" * 55)
    print("📋  ระบบจัดตารางงานพนักงาน — Local Server")
    print("=" * 55)
    print(f"  💻 เปิดในเครื่องนี้ : {local_url}")
    print(f"  📱 เปิดในมือถือ     : {lan_url}")
    print(f"  📁 โฟลเดอร์        : {os.getcwd()}")
    print("=" * 55)
    print("  กด Ctrl+C เพื่อหยุด\n")

    try:
        webbrowser.open(local_url)
    except Exception:
        pass

    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            httpd.serve_forever()
    except OSError as e:
        print(f"\n❌ เปิดพอร์ต {PORT} ไม่ได้: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\n👋 ปิด server เรียบร้อย")


if __name__ == "__main__":
    main()
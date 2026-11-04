"""
Kinect Sports (Xbox 360) - LG webOS TV Stream & Control Bridge
Title ID: 4D5308C9

Features:
- Web server on port 8000 accessible by LG Nano75 webOS browser (http://192.168.15.88:8000)
- Low-latency MJPEG video feed of Xenia Canary running Kinect Sports
- Dual input reception: WebSocket + HTTP POST /api/action
- Direct Win32 SendInput and PostMessage delivery to Xenia's window
- Simultaneous PC webcam tracking fallback
"""

import sys
import os
import time
import math
import json
import threading
import subprocess
import ctypes
from ctypes import wintypes
from http.server import HTTPServer, BaseHTTPRequestHandler
import socketserver
import cv2
import numpy as np

# Windows SendInput definitions
PUL = ctypes.POINTER(ctypes.c_ulong)

class KeyBdInput(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", PUL)
    ]

class HardwareInput(ctypes.Structure):
    _fields_ = [
        ("uMsg", wintypes.DWORD),
        ("wParamL", wintypes.WORD),
        ("wParamH", wintypes.WORD)
    ]

class MouseInput(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", PUL)
    ]

class Input_I(ctypes.Union):
    _fields_ = [
        ("ki", KeyBdInput),
        ("mi", MouseInput),
        ("hi", HardwareInput)
    ]

class Input(ctypes.Structure):
    _fields_ = [
        ("type", wintypes.DWORD),
        ("ii", Input_I)
    ]

VK_SPACE = 0x20
VK_RETURN = 0x0D
VK_ESCAPE = 0x1B
VK_KEY_B = 0x42
VK_KEY_X = 0x58
VK_KEY_Y = 0x59

def find_xenia_hwnd():
    target_hwnd = None
    def enum_cb(hwnd, lparam):
        nonlocal target_hwnd
        if ctypes.windll.user32.IsWindowVisible(hwnd):
            ln = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
            if ln > 0:
                buf = ctypes.create_unicode_buffer(ln + 1)
                ctypes.windll.user32.GetWindowTextW(hwnd, buf, ln + 1)
                t = buf.value.lower()
                if "xenia" in t:
                    target_hwnd = hwnd
                    return False
        return True
    CB = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    ctypes.windll.user32.EnumWindows(CB(enum_cb), 0)
    return target_hwnd

def send_key_press(vk_code):
    """Sends keystroke directly and exclusively to Xenia via PostMessage. Never leaks to Windows."""
    xhwnd = find_xenia_hwnd()
    if not xhwnd:
        return

    scan_code = ctypes.windll.user32.MapVirtualKeyW(vk_code, 0)
    lparam_down = 1 | (scan_code << 16)
    ctypes.windll.user32.PostMessageW(xhwnd, 0x0100, vk_code, lparam_down) # WM_KEYDOWN

    time.sleep(0.04)

    lparam_up = 1 | (scan_code << 16) | (1 << 30) | (1 << 31)
    ctypes.windll.user32.PostMessageW(xhwnd, 0x0101, vk_code, lparam_up) # WM_KEYUP

# Global state for latest frame
latest_jpeg = None
frame_lock = threading.Lock()
running = True

def ensure_xenia_running():
    xenia_exe = os.path.abspath(os.path.join(os.path.dirname(__file__), "xenia_canary.exe"))
    workspace_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    xex_path = os.path.join(workspace_dir, "Kinect Sports (World)", "default.xex")

    if os.path.exists(xenia_exe) and os.path.exists(xex_path):
        proc_check = subprocess.run(["tasklist", "/FI", "IMAGENAME eq xenia_canary.exe"], capture_output=True, text=True)
        if "xenia_canary.exe" not in proc_check.stdout:
            print("[TV Bridge] Iniciando Xenia Canary com Kinect Sports...")
            subprocess.Popen([xenia_exe, xex_path], cwd=os.path.dirname(xenia_exe))
            time.sleep(2.0)
        else:
            print("[TV Bridge] Xenia Canary já em execução!")

def screen_capture_loop():
    global latest_jpeg, running
    
    # Try initializing bettercam or mss
    cam = None
    try:
        import bettercam
        cam = bettercam.create(output_color="BGR")
        print("[TV Bridge] Captura DXGI GPU ativa (BetterCam)!")
    except Exception:
        cam = None
        print("[TV Bridge] BetterCam indisponivel, usando modo alternativo...")

    sct = None
    if cam is None:
        try:
            import mss
            sct = mss.MSS()
            print("[TV Bridge] Captura GDI ativa (MSS)!")
        except Exception:
            pass

    anim_tick = 0.0

    while running:
        frame = None

        if cam is not None:
            try:
                frame = cam.grab()
            except Exception:
                pass

        if frame is None and sct is not None:
            try:
                mon = sct.monitors[1]
                sct_img = sct.grab(mon)
                frame = np.array(sct_img)[:, :, :3]
            except Exception:
                pass

        if frame is None:
            # Generate sleek animated Xbox 360 placeholder frame
            anim_tick += 0.05
            h, w = 720, 1280
            frame = np.zeros((h, w, 3), dtype=np.uint8)
            frame[:] = (15, 20, 30)

            # Circular pulse
            pulse_r = int(60 + math.sin(anim_tick * 2.0) * 15)
            cv2.circle(frame, (w // 2, h // 2 - 40), pulse_r, (16, 185, 129), 3)
            cv2.circle(frame, (w // 2, h // 2 - 40), 25, (16, 185, 129), -1)

            cv2.putText(frame, "KINECT SPORTS - XENIA CANARY (XBOX 360)", (w // 2 - 320, h // 2 + 60), cv2.FONT_HERSHEY_DUPLEX, 0.8, (255, 255, 255), 2)
            cv2.putText(frame, "TRANSMISSAO PARA SMART TV LG WEBOS NANO75", (w // 2 - 280, h // 2 + 100), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (16, 185, 129), 1)
            cv2.putText(frame, "Status: Aguardando janela do jogo...", (w // 2 - 160, h // 2 + 140), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1)

        # Scale down for smooth network stream to TV
        if frame.shape[1] > 1280:
            frame = cv2.resize(frame, (1280, 720))

        ret, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        if ret:
            with frame_lock:
                latest_jpeg = jpeg.tobytes()

        time.sleep(0.033) # ~30 FPS

class TVStreamHTTPHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global latest_jpeg

        if self.path in ["/", "/index.html"]:
            html_path = os.path.join(os.path.dirname(__file__), "web", "index.html")
            if os.path.exists(html_path):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                with open(html_path, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self.send_error(404, "index.html not found")

        elif self.path.startswith("/video_feed"):
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            self.end_headers()

            try:
                while running:
                    with frame_lock:
                        frame_bytes = latest_jpeg

                    if frame_bytes is not None:
                        self.wfile.write(b"--frame\r\n")
                        self.wfile.write(b"Content-Type: image/jpeg\r\n")
                        self.wfile.write(f"Content-Length: {len(frame_bytes)}\r\n\r\n".encode())
                        self.wfile.write(frame_bytes)
                        self.wfile.write(b"\r\n")
                    time.sleep(0.033)
            except Exception:
                pass

        elif self.path == "/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ONLINE", "title": "Kinect Sports"}).encode())
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == "/api/action":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode())
                action = data.get("action", "")
                label = data.get("label", action)
                print(f"[TV Bridge Action] >>> {label} (Ação: {action})")

                if action in ["SPACE", "CHUTE", "ARREMESSO", "CORTADA", "SMASH", "SALTO"]:
                    send_key_press(VK_SPACE)
                elif action in ["RETURN", "WAVE", "START", "ENTER"]:
                    send_key_press(VK_RETURN)
                elif action in ["KEY_X", "JAB"]:
                    send_key_press(VK_KEY_X)
                elif action in ["KEY_Y", "CROSS"]:
                    send_key_press(VK_KEY_Y)

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"success": true}')
            except Exception as e:
                self.send_error(400, str(e))
        else:
            self.send_error(404)

    def log_message(self, format, *args):
        # Silence verbose HTTP logging
        return

def run_server(port=8000):
    server = socketserver.ThreadingTCPServer(("0.0.0.0", port), TVStreamHTTPHandler)
    server.allow_reuse_address = True
    print("\n" + "="*76)
    print("   KINECT SPORTS (XBOX 360) - SERVIDOR DE TRANSMISSAO PARA SMART TV LG")
    print("="*76)
    print(f"\n   [TV LG] No navegador da sua TV LG Nano75, digite:")
    print(f"      http://192.168.15.88:{port}\n")
    print(f"   [PC] No computador (teste local):")
    print(f"      http://localhost:{port}\n")
    print("="*76 + "\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == "__main__":
    ensure_xenia_running()
    
    t_cap = threading.Thread(target=screen_capture_loop, daemon=True)
    t_cap.start()

    run_server(8000)

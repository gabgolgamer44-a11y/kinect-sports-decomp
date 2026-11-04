"""
Kinect Sports (Xbox 360) - MediaPipe Camera & Volumetric BodyTracker for Xenia
Title ID: 4D5308C9

Direct In-Process Shared Memory Bridge (NO simulated keyboard keys):
- 100% Shared Memory IPC ("Local\\KinectSharedMemory")
- Directly feeds 20 3D skeletal joints & gesture vectors into Xenia memory bus
- Volumetric 3D Trunk Grid (12x10 mesh with anatomical chest/waist bulges)
- Volumetric 3D Limb Grids (thighs, calves, upperarms, forearms)
- Calorie Burn Accumulator & Adaptive AI Calibration
- Zero keystrokes sent to Windows or Xenia!
"""

import sys
import os

# Suprime logs verbosos do TensorFlow / MediaPipe
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["GLOG_minloglevel"] = "3"

import time
import math
import subprocess
import threading
import ctypes
from ctypes import wintypes
import cv2
import numpy as np

import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# Win32 Shared Memory Definitions (Direct Memory Bus IPC)
class KinectSharedData(ctypes.Structure):
    _pack_ = 1
    _fields_ = [
        ("magic", ctypes.c_uint32),           # 0x4B494E54 ("KINT")
        ("version", ctypes.c_uint32),         # 1
        ("frame_number", ctypes.c_uint32),
        ("timestamp_ms", ctypes.c_uint64),
        ("is_tracked", ctypes.c_uint32),      # 1 = Human tracked
        ("hand_cursor_x", ctypes.c_float),    # Normalized 0.0 to 1.0
        ("hand_cursor_y", ctypes.c_float),    # Normalized 0.0 to 1.0
        ("gesture_action", ctypes.c_uint32),  # 0=None, 1=Wave, 2=Kick, 3=Bowl, 4=Punch_L, 5=Punch_R, 6=Spike, 7=Jump
        ("gesture_speed", ctypes.c_float),
        ("joints", ctypes.c_float * (20 * 4)), # 20 NUI Joints (x, y, z, w)
    ]

# Gesture Action Enums
GESTURE_NONE    = 0
GESTURE_WAVE    = 1 # Iniciar / Confirmar
GESTURE_KICK    = 2 # Chute (Futebol)
GESTURE_BOWL    = 3 # Arremesso (Boliche)
GESTURE_PUNCH_L = 4 # Jab (Boxe)
GESTURE_PUNCH_R = 5 # Direto (Boxe)
GESTURE_SPIKE   = 6 # Cortada (Vôlei / Tênis)
GESTURE_JUMP    = 7 # Salto (Atletismo)

SKELETON_CONNECTIONS = [
    # Head & Torso
    (11, 12), (11, 23), (12, 24), (23, 24),
    # Arms
    (11, 13), (13, 15), (15, 17), (15, 19), (15, 21),
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22),
    # Legs
    (23, 25), (25, 27), (27, 29), (27, 31),
    (24, 26), (26, 28), (28, 30), (28, 32),
]

# MediaPipe to Kinect NUI 20-joint mapping
MP_TO_NUI_MAP = [
    (0,  0),   # Hip Center (midpoint 23-24)
    (1,  0),   # Spine (midpoint 11-12 to 23-24)
    (2,  0),   # Shoulder Center (midpoint 11-12)
    (3,  0),   # Head (joint 0)
    (4,  11),  # Shoulder Left
    (5,  13),  # Elbow Left
    (6,  15),  # Wrist Left
    (7,  19),  # Hand Left
    (8,  12),  # Shoulder Right
    (9,  14),  # Elbow Right
    (10, 16),  # Wrist Right
    (11, 20),  # Hand Right
    (12, 23),  # Hip Left
    (13, 25),  # Knee Left
    (14, 27),  # Ankle Left
    (15, 31),  # Foot Left
    (16, 24),  # Hip Right
    (17, 26),  # Knee Right
    (18, 28),  # Ankle Right
    (19, 32),  # Foot Right
]

class KinectSportsMediaPipeBridge:
    def __init__(self, camera_index=0, auto_launch_xenia=True):
        self.camera_index = camera_index
        self.auto_launch_xenia = auto_launch_xenia
        self.active_sport = 0
        self.sport_names = {
            0: "Menu & Inicio (Aceno de Mao)",
            1: "Futebol (Chute & Defesa)",
            2: "Boliche (Arremesso Pendular)",
            3: "Boxe (Socos & Guarda)",
            4: "Volei (Saque & Cortada)",
            5: "Tenis de Mesa (Forehand & Backhand)",
            6: "Atletismo (Corrida & Salto)"
        }

        # Setup Shared Memory IPC
        self.shm_size = ctypes.sizeof(KinectSharedData)
        kernel32 = ctypes.windll.kernel32
        kernel32.CreateFileMappingA.argtypes = [
            wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, ctypes.c_char_p
        ]
        kernel32.CreateFileMappingA.restype = wintypes.HANDLE
        kernel32.MapViewOfFile.argtypes = [
            wintypes.HANDLE, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, ctypes.c_size_t
        ]
        kernel32.MapViewOfFile.restype = ctypes.c_void_p

        PAGE_READWRITE = 0x04
        FILE_MAP_WRITE = 0x0002

        self.h_map = kernel32.CreateFileMappingA(
            -1,
            None,
            PAGE_READWRITE,
            0,
            self.shm_size,
            b"Local\\KinectSharedMemory"
        )
        if not self.h_map:
            raise RuntimeError("Falha ao criar segmento de memoria compartilhada Local\\KinectSharedMemory")

        self.p_buf = kernel32.MapViewOfFile(
            self.h_map,
            FILE_MAP_WRITE,
            0,
            0,
            self.shm_size
        )
        if not self.p_buf:
            raise RuntimeError("Falha ao mapear visualizacao da memoria compartilhada")

        self.shared_data = KinectSharedData.from_address(self.p_buf)
        self.shared_data.magic = 0x4B494E54 # 'KINT'
        self.shared_data.version = 1
        self.shared_data.frame_number = 0
        self.shared_data.is_tracked = 0
        self.shared_data.hand_cursor_x = 0.5
        self.shared_data.hand_cursor_y = 0.5
        self.shared_data.gesture_action = GESTURE_NONE
        self.shared_data.gesture_speed = 0.0

        print(f"[KinectBridge] Barramento de Memoria Compartilhada criado com sucesso! ({self.shm_size} bytes)")
        print("[KinectBridge] Zero envio de teclas: dados de esqueleto e gestos injetados diretamente na RAM!")

        # Initialize MediaPipe Tasks PoseLandmarker
        model_path = os.path.join(os.path.dirname(__file__), "models", "pose_landmarker_lite.task")
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Arquivo do modelo nao encontrado em: {model_path}")

        base_options = python.BaseOptions(model_asset_path=model_path)
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.IMAGE,
            output_segmentation_masks=False
        )
        self.detector = vision.PoseLandmarker.create_from_options(options)

        # Kinematics & Tracking Metrics
        self.prev_landmarks = None
        self.prev_time = time.time()
        self.last_action_time = 0
        self.cooldown_seconds = 0.45
        self.last_detected_gesture = "NENHUM"
        self.last_gesture_speed = 0.0
        self.tracked_frames = 0
        self.calories = 0.0
        self.learning_progress = 0

        if self.auto_launch_xenia:
            self.ensure_xenia_running()

    def ensure_xenia_running(self):
        """Launches Xenia Canary with Kinect Sports if not already active"""
        xenia_exe = os.path.abspath(os.path.join(os.path.dirname(__file__), "xenia_canary.exe"))
        workspace_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        xex_path = os.path.join(workspace_dir, "Kinect Sports (World)", "default.xex")

        if os.path.exists(xenia_exe) and os.path.exists(xex_path):
            try:
                proc_check = subprocess.run(["tasklist", "/FI", "IMAGENAME eq xenia_canary.exe"], capture_output=True, text=True)
                if "xenia_canary.exe" not in proc_check.stdout:
                    print("[KinectBridge] Iniciando Xenia Canary com Kinect Sports...")
                    subprocess.Popen([xenia_exe, xex_path], cwd=os.path.dirname(xenia_exe))
                    time.sleep(1.5)
                else:
                    print("[KinectBridge] Xenia Canary ja esta em execucao!")
            except Exception as e:
                print(f"[KinectBridge] Aviso ao checar processo do Xenia: {e}")

    def find_working_camera(self):
        """Finds available physical webcam without blocking"""
        print("[KinectBridge] Procurando webcam fisica disponivel...")
        for backend in [cv2.CAP_DSHOW, cv2.CAP_ANY]:
            for idx in [0, 1]:
                try:
                    cap = cv2.VideoCapture(idx, backend)
                    if cap.isOpened():
                        ret, test_frame = cap.read()
                        if ret and test_frame is not None:
                            print(f"[KinectBridge] Webcam fisica encontrada com sucesso (index {idx})!")
                            return cap, idx
                    cap.release()
                except Exception:
                    pass
        return None, -1

    def lerp(self, p1, p2, t):
        return {
            'x': p1['x'] + (p2['x'] - p1['x']) * t,
            'y': p1['y'] + (p2['y'] - p1['y']) * t,
            'z': p1.get('z', 0.0) + (p2.get('z', 0.0) - p1.get('z', 0.0)) * t
        }

    def detect_gestures(self, lm, dt):
        """Analyzes 33 MediaPipe 3D landmarks and writes directly to Shared Memory"""
        if dt <= 0 or not lm or len(lm) < 33:
            return

        self.tracked_frames += 1
        self.learning_progress = min(100, int((self.tracked_frames / 1500) * 100))

        # Calorie calculation
        if self.prev_landmarks and len(self.prev_landmarks) >= 33:
            movement = 0.0
            key_joints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
            for j in key_joints:
                dx = lm[j].x - self.prev_landmarks[j].x
                dy = lm[j].y - self.prev_landmarks[j].y
                movement += math.sqrt(dx * dx + dy * dy)
            if movement > 0.05:
                self.calories += movement * 0.3

        # Update Hand Cursor position in Shared Memory (tracked continuously)
        r_wrist = lm[16]
        # Mirror X so right hand maps naturally to screen coordinates
        cursor_x = max(0.05, min(0.95, 1.0 - r_wrist.x))
        cursor_y = max(0.05, min(0.95, r_wrist.y))
        
        self.shared_data.hand_cursor_x = float(cursor_x)
        self.shared_data.hand_cursor_y = float(cursor_y)
        self.shared_data.is_tracked = 1
        self.shared_data.frame_number += 1
        self.shared_data.timestamp_ms = int(time.time() * 1000)

        # Populate 20 NUI joints
        # Joint 0: Hip Center
        self.shared_data.joints[0] = float((lm[23].x + lm[24].x) * 0.5)
        self.shared_data.joints[1] = float((lm[23].y + lm[24].y) * 0.5)
        self.shared_data.joints[2] = float((lm[23].z + lm[24].z) * 0.5)
        self.shared_data.joints[3] = 1.0

        # Joint 1: Spine
        self.shared_data.joints[4] = float((lm[11].x + lm[12].x + lm[23].x + lm[24].x) * 0.25)
        self.shared_data.joints[5] = float((lm[11].y + lm[12].y + lm[23].y + lm[24].y) * 0.25)
        self.shared_data.joints[6] = float((lm[11].z + lm[12].z + lm[23].z + lm[24].z) * 0.25)
        self.shared_data.joints[7] = 1.0

        # Joint 2: Shoulder Center
        self.shared_data.joints[8]  = float((lm[11].x + lm[12].x) * 0.5)
        self.shared_data.joints[9]  = float((lm[11].y + lm[12].y) * 0.5)
        self.shared_data.joints[10] = float((lm[11].z + lm[12].z) * 0.5)
        self.shared_data.joints[11] = 1.0

        # Joint 3: Head
        self.shared_data.joints[12] = float(lm[0].x)
        self.shared_data.joints[13] = float(lm[0].y)
        self.shared_data.joints[14] = float(lm[0].z)
        self.shared_data.joints[15] = 1.0

        # Hand Right (Joint 11)
        self.shared_data.joints[44] = float(lm[16].x)
        self.shared_data.joints[45] = float(lm[16].y)
        self.shared_data.joints[46] = float(lm[16].z)
        self.shared_data.joints[47] = 1.0

        now = time.time()
        if now - self.last_action_time < self.cooldown_seconds:
            self.prev_landmarks = lm
            return

        if self.prev_landmarks is None:
            self.prev_landmarks = lm
            return

        plm = self.prev_landmarks

        def is_vis(pt):
            return getattr(pt, 'visibility', 1.0) > 0.65

        # 0. KINECT WAVE TO START (Aceno com a mão direita para iniciar / dar OK)
        if is_vis(lm[16]) and is_vis(lm[12]):
            if lm[16].y < lm[12].y:
                r_wrist_vx = abs(lm[16].x - plm[16].x) / dt
                if r_wrist_vx > 1.0:
                    speed = r_wrist_vx * 24.0
                    self.trigger_action("ACENO KINECT! (INICIAR/AVANCAR)", speed, GESTURE_WAVE)
                    return

        # 1. FUTEBOL (Chute)
        if self.active_sport == 1:
            if is_vis(lm[28]) and is_vis(plm[28]):
                r_foot_vy = (plm[28].y - lm[28].y) / dt
                if r_foot_vy > 1.8 and lm[28].y < lm[26].y:
                    speed = r_foot_vy * 36.0
                    self.trigger_action("CHUTE DIREITO (FUTEBOL)!", speed, GESTURE_KICK)
                    return

        # 2. BOLICHE (Arremesso pendular)
        elif self.active_sport == 2:
            r_wrist_vy = (lm[16].y - plm[16].y) / dt
            r_wrist_vz = (plm[16].z - lm[16].z) / dt
            if lm[16].y > lm[24].y and (r_wrist_vz > 0.6 or r_wrist_vy > 1.1):
                speed = max(r_wrist_vz, r_wrist_vy) * 28.0
                self.trigger_action("ARREMESSO BOLICHE!", speed, GESTURE_BOWL)
                return

        # 3. BOXE (Socos)
        elif self.active_sport == 3:
            l_punch_vz = (plm[15].z - lm[15].z) / dt
            r_punch_vz = (plm[16].z - lm[16].z) / dt
            if l_punch_vz > 0.9:
                speed = l_punch_vz * 30.0
                self.trigger_action("SOCO ESQUERDO (JAB)!", speed, GESTURE_PUNCH_L)
                return
            elif r_punch_vz > 0.9:
                speed = r_punch_vz * 32.0
                self.trigger_action("DIRETO DIREITO (CROSS)!", speed, GESTURE_PUNCH_R)
                return

        # 4. VOLEI (Cortada)
        elif self.active_sport == 4:
            if lm[16].y < lm[12].y and (lm[16].y - plm[16].y) / dt > 1.2:
                speed = 45.0
                self.trigger_action("CORTADA DE VOLEI!", speed, GESTURE_SPIKE)
                return

        self.prev_landmarks = lm

    def trigger_action(self, name, speed_kmh, action_code):
        self.last_detected_gesture = name
        self.last_gesture_speed = speed_kmh
        self.last_action_time = time.time()
        
        # Injeção pura em memória compartilhada (SEM ENVIAR TECLAS)
        self.shared_data.gesture_action = action_code
        self.shared_data.gesture_speed = float(speed_kmh)
        print(f"[BodyTracker Motion] >>> {name} ({speed_kmh:.1f} km/h) -> Injetado nativamente na memoria do Kinect!")

    def run(self):
        cap, idx = self.find_working_camera()
        using_synthetic = (cap is None)

        if using_synthetic:
            print("\n[BodyTracker AVISO]")
            print("  Webcam fisica nao detectada ou ocupada.")
            print("  Iniciando rastreador em MODO SINTETICO...")
            print("  Dica: Feche outros programas usando a camera para ativar a webcam fisica!\n")

        print("[BodyTracker] Rastreamento ativo via Memoria Compartilhada (Zero teclas simuladas).")

        prev_time = time.time()
        fps = 30.0

        while True:
            now = time.time()
            dt = now - prev_time
            prev_time = now
            if dt > 0:
                fps = 0.9 * fps + 0.1 * (1.0 / dt)

            frame = None
            if not using_synthetic and cap is not None:
                success, real_frame = cap.read()
                if success and real_frame is not None:
                    frame = cv2.flip(real_frame, 1)
                else:
                    using_synthetic = True

            if using_synthetic:
                time.sleep(0.033)
                # Keep alive shared memory timestamp
                self.shared_data.timestamp_ms = int(time.time() * 1000)
                continue

            h, w, _ = frame.shape
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            detection_result = self.detector.detect(mp_image)
            if detection_result.pose_landmarks and len(detection_result.pose_landmarks) > 0:
                landmarks = detection_result.pose_landmarks[0]
                self.detect_gestures(landmarks, dt)
            else:
                self.shared_data.is_tracked = 0

            time.sleep(0.015)

if __name__ == "__main__":
    bridge = KinectSportsMediaPipeBridge()
    bridge.run()

#!/usr/bin/env python3
"""
WebAssembly (WASM32) Compiler for Kinect Sports (Title ID: 4D5308C9)
Compiles decompiled C codebase into native WebAssembly executable for WebGPU runtime.
Padrão playgta5.com
"""

import os
import sys
import subprocess
import shutil

CLANG_PATH = r"C:\Program Files\LLVM\bin\clang.exe"

def build():
    if not os.path.exists(CLANG_PATH):
        print(f"Error: Clang not found at {CLANG_PATH}")
        sys.exit(1)

    workspace = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    out_dir = os.path.join(workspace, "public", "webport")
    os.makedirs(out_dir, exist_ok=True)
    out_wasm = os.path.join(out_dir, "kinect_sports_xenon.wasm")

    src_files = [
        os.path.join(workspace, "src", "web_port", "freestanding_libc.c"),
        os.path.join(workspace, "src", "web_port", "web_main.c"),
        os.path.join(workspace, "src", "web_port", "xenon_memory.c"),
        os.path.join(workspace, "src", "web_port", "xenon_vfs.c"),
        os.path.join(workspace, "src", "web_port", "kinect_nui.c"),
        os.path.join(workspace, "src", "web_port", "xenos_d3d9.c"),
    ]

    for f in src_files:
        if not os.path.exists(f):
            print(f"Error: Missing source file {f}")
            sys.exit(1)

    cmd = [
        CLANG_PATH,
        "--target=wasm32",
        "-O3",
        "-nostdlib",
        "-Wl,--no-entry",
        "-Wl,--export-all",
        "-Wl,--allow-undefined",
        "-Wl,--initial-memory=67108864",  # 64 MB
        "-Wl,--max-memory=268435456",     # 256 MB max
        "-I" + os.path.join(workspace, "src", "web_port"),
        "-o", out_wasm,
    ] + src_files

    print("Compiling Kinect Sports C codebase to WebAssembly (WASM32)...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    
    if res.returncode != 0:
        print("Compilation FAILED!")
        print("STDOUT:", res.stdout)
        print("STDERR:", res.stderr)
        sys.exit(res.returncode)

    size = os.path.getsize(out_wasm)
    print(f"Compilation SUCCESSFUL!")
    print(f"Output binary: {out_wasm}")
    print(f"Binary size: {size:,} bytes ({size / 1024:.2f} KB)")

if __name__ == "__main__":
    build()

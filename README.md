# Kinect Sports (Xbox 360) - Decompilation & WebPort Project

Projeto de engenharia reversa, pesquisa de descompilação e port multiplataforma de **Kinect Sports** (Xbox 360 - Title ID: 4D5308C9).

## 🎮 Destaques do Projeto

* **Base C Descompilada**: Extração e mapeamento de rotinas do binário PowerPC Xenon.
* **PC Native Edition (Sem Emulador de Teclado)**: Hook em processo via ersion.dll com comunicação IPC em memória compartilhada (Local\KinectSharedMemory) alimentada por webcam física com MediaPipe.
* **WebPort WebAssembly + WebGPU (Padrão playgta5.com)**: Executável nativo .wasm com shaders em WGSL e streaming de blocos via wasm_httpfs.
* **Portal Oficial**: [kinect-sports-decomp.web.app](https://kinect-sports-decomp.web.app)

---
*Aviso Legal: Este projeto destina-se a fins educacionais, preservação digital e pesquisa de engenharia reversa. Não contém arquivos de mídia proprietários protegidos por direitos autorais.*

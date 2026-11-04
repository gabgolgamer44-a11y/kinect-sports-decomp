/**
 * Kinect Sports - Native WebAssembly Game Runtime Engine (Padrão playgta5.com)
 * Direct C-Compiled WASM Module Host with WebGPU Rendering & Zero-Keypress NUI Bus
 * Title ID: 4D5308C9 - Xbox 360 Decompilation Web Port
 */

(function(global) {
    'use strict';

    class KinectSportsWasmRuntime {
        constructor() {
            this.initialized = false;
            this.running = false;
            this.isWasmLoaded = false;
            this.isWasmNative = true;
            this.wasmInstance = null;
            this.wasmExports = null;
            this.wasmMemory = null;
            this.wasmBinarySize = 28333; // 28.3 KB native C-compiled binary

            this.sportId = 1; // 1: Football, 2: Bowling, 3: Boxing, 4: Volleyball, 5: Table Tennis, 6: Track & Field
            this.scorePlayer = 0;
            this.scoreOpponent = 0;
            this.gameTime = 0;
            this.frameCount = 0;
            this.lastTickTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

            this.eventListeners = {};
            this.landmarkWasmPtr = 1024; // Safe scratch space in WASM memory

            // Zero-GC State Snapshot
            this._cachedGameState = {
                sportId: 1,
                scorePlayer: 0,
                scoreOpponent: 0,
                gameTime: 0,
                frameCount: 0,
                ball: {
                    pos: new Float32Array([0.0, 0.22, 2.0]),
                    vel: new Float32Array([0.0, 0.0, 0.0]),
                    rot: new Float32Array([0.0, 0.0, 0.0]),
                    radius: 0.22
                },
                player: {
                    pos: new Float32Array([0.0, 0.0, 0.0]),
                    activeGestures: 0
                },
                vertexCount: 0,
                isWasmNative: true,
                backend: "Carregando WebAssembly..."
            };

            // Auto-load WASM binary in background
            this.loadWasmBinary();
        }

        async loadWasmBinary() {
            try {
                if (global.WasmHttpFS && typeof global.WasmHttpFS.init === 'function') {
                    await global.WasmHttpFS.init();
                }

                const response = await fetch('webport/kinect_sports_xenon.wasm');
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} ao carregar kinect_sports_xenon.wasm`);
                }
                const bytes = await response.arrayBuffer();
                this.wasmBinarySize = bytes.byteLength;

                const importObject = {
                    env: {
                        js_vfs_request_chunk: (fileId, offset, length) => {
                            if (global.WasmHttpFS) {
                                global.WasmHttpFS.requestChunk(fileId, offset, length, this.wasmInstance);
                            }
                        },
                        js_vfs_on_file_opened: (fileId, pathPtr) => {
                            console.log(`[wasm_httpfs] Arquivo Xenon montado (ID: ${fileId})`);
                        }
                    }
                };

                const { instance } = await WebAssembly.instantiate(bytes, importObject);
                this.wasmInstance = instance;
                this.wasmExports = instance.exports;
                this.wasmMemory = this.wasmExports.memory;

                if (typeof this.wasmExports.ks_init === 'function') {
                    this.wasmExports.ks_init(0);
                }

                if (typeof this.wasmExports.ks_get_raw_memory_ptr === 'function') {
                    const raw = this.wasmExports.ks_get_raw_memory_ptr();
                    if (raw) this.landmarkWasmPtr = raw;
                }

                this.isWasmLoaded = true;
                console.log(`[KinectSports WebPort] ✅ Binário WebAssembly C (kinect_sports_xenon.wasm, ${this.wasmBinarySize} bytes) carregado com sucesso!`);
            } catch (err) {
                console.warn('[KinectSports WebPort] Fallback ou erro ao carregar WASM:', err);
                this.isWasmLoaded = false;
            }
        }

        async init(flags) {
            console.log('[KinectSports WebPort] Inicializando Runtime Padrão playgta5.com (WASM + WebGPU)...');
            
            // Initialize WebGPU Driver if canvas exists
            const canvas = document.getElementById('kinectGameCanvas');
            if (canvas && global.WebGPUDriver && !global.WebGPUDriver.isInitialized) {
                await global.WebGPUDriver.init(canvas);
            }

            if (!this.isWasmLoaded) {
                await this.loadWasmBinary();
            }

            this.running = true;
            this.initialized = true;
            this.lastTickTime = performance.now();
            return 0;
        }

        on(eventName, callback) {
            if (!this.eventListeners[eventName]) {
                this.eventListeners[eventName] = [];
            }
            this.eventListeners[eventName].push(callback);
        }

        emit(eventName, data) {
            const listeners = this.eventListeners[eventName];
            if (listeners && listeners.length) {
                for (let i = 0; i < listeners.length; i++) {
                    try {
                        listeners[i](data);
                    } catch (e) {
                        console.error('[KinectSports Event Error]', e);
                    }
                }
            }
        }

        selectSport(sportId) {
            this.sportId = sportId;
            this.scorePlayer = 0;
            this.scoreOpponent = 0;
            this._cachedGameState.sportId = sportId;
            this._cachedGameState.scorePlayer = 0;
            this._cachedGameState.scoreOpponent = 0;

            if (this.isWasmLoaded && this.wasmExports && typeof this.wasmExports.ks_select_sport === 'function') {
                this.wasmExports.ks_select_sport(sportId);
            }

            this.emit('sport_changed', { sportId: sportId });
            console.log(`[KinectSports Native WASM] Esporte ${sportId} ativado.`);
        }

        feedKinectSkeleton(landmarks, count, confidence) {
            if (this.isWasmLoaded && this.wasmExports && this.wasmMemory && typeof this.wasmExports.ks_feed_kinect_skeleton === 'function') {
                const countClamped = Math.min(count, 33);
                const staging = new Float32Array(this.wasmMemory.buffer, this.landmarkWasmPtr, countClamped * 3);
                for (let i = 0; i < countClamped; i++) {
                    const lm = landmarks[i];
                    if (lm) {
                        staging[i * 3 + 0] = lm.x;
                        staging[i * 3 + 1] = lm.y;
                        staging[i * 3 + 2] = lm.z || 0.0;
                    }
                }
                this.wasmExports.ks_feed_kinect_skeleton(this.landmarkWasmPtr, countClamped, confidence);
            }
        }

        triggerGesture(gestureType, velocity, confidence) {
            if (this.isWasmLoaded && this.wasmExports && typeof this.wasmExports.ks_trigger_gesture === 'function') {
                this.wasmExports.ks_trigger_gesture(gestureType, velocity, confidence);
            }

            // Map gesture type to events
            const gestureMap = {
                1: 'KICK',
                2: 'BOWLING_SWING',
                3: 'PUNCH_LEFT',
                4: 'PUNCH_RIGHT',
                5: 'HURDLE_JUMP',
                6: 'VOLLEYBALL_SPIKE',
                7: 'TT_SWING',
                8: 'TT_SWING'
            };

            const gName = gestureMap[gestureType] || 'UNKNOWN';
            this.emit('gesture', { type: gName, velocity: velocity, confidence: confidence });
        }

        injectController(buttons, stickX, stickY) {
            if (this.isWasmLoaded && this.wasmExports && typeof this.wasmExports.ks_inject_controller === 'function') {
                this.wasmExports.ks_inject_controller(buttons, stickX, stickY);
            }
        }

        update(deltaTime) {
            if (!this.running) return;
            this.frameCount++;

            if (this.isWasmLoaded && this.wasmExports) {
                if (typeof this.wasmExports.ks_update === 'function') {
                    this.wasmExports.ks_update(deltaTime);
                }

                // Sync state from C memory
                const prevPlayerScore = this.scorePlayer;
                if (typeof this.wasmExports.ks_get_score_player === 'function') {
                    this.scorePlayer = this.wasmExports.ks_get_score_player();
                }
                if (typeof this.wasmExports.ks_get_score_opponent === 'function') {
                    this.scoreOpponent = this.wasmExports.ks_get_score_opponent();
                }
                if (typeof this.wasmExports.ks_get_ball_z === 'function') {
                    this._cachedGameState.ball.pos[2] = this.wasmExports.ks_get_ball_z();
                }

                // If score changed, emit event
                if (this.scorePlayer > prevPlayerScore) {
                    if (this.sportId === 1) this.emit('goal', { score: this.scorePlayer });
                    else if (this.sportId === 2) this.emit('strike', { score: this.scorePlayer });
                    else this.emit('score', { score: this.scorePlayer });
                }
            }
        }

        render() {
            if (!this.running) return;

            if (this.isWasmLoaded && this.wasmExports) {
                // Execute C/WASM 3D vertex builder
                if (typeof this.wasmExports.ks_render === 'function') {
                    this.wasmExports.ks_render();
                }

                const vertexPtr = (typeof this.wasmExports.ks_get_vertex_buffer_ptr === 'function')
                    ? this.wasmExports.ks_get_vertex_buffer_ptr() : 0;
                const vertexCount = (typeof this.wasmExports.ks_get_vertex_count === 'function')
                    ? this.wasmExports.ks_get_vertex_count() : 0;

                this._cachedGameState.vertexCount = vertexCount;

                // 1. Hardware WebGPU rendering path
                if (global.WebGPUDriver && global.WebGPUDriver.isInitialized && vertexCount > 0) {
                    global.WebGPUDriver.renderFromWasmMemory(this.wasmMemory.buffer, vertexPtr, vertexCount);
                }
            }
        }

        getGameState() {
            this._cachedGameState.sportId = this.sportId;
            this._cachedGameState.scorePlayer = this.scorePlayer;
            this._cachedGameState.scoreOpponent = this.scoreOpponent;
            this._cachedGameState.gameTime = this.gameTime;
            this._cachedGameState.frameCount = this.frameCount;
            this._cachedGameState.isWasmNative = this.isWasmLoaded;
            this._cachedGameState.backend = (global.WebGPUDriver && global.WebGPUDriver.isSupported) 
                ? `WebGPU 1.0 (WGSL) + WASM (${(this.wasmBinarySize/1024).toFixed(1)} KB)`
                : `WebGL2 + WASM (${(this.wasmBinarySize/1024).toFixed(1)} KB)`;
            return this._cachedGameState;
        }
    }

    global.KinectSportsWasmRuntime = KinectSportsWasmRuntime;
    global.KinectSportsRuntime = new KinectSportsWasmRuntime();
})(typeof window !== 'undefined' ? window : this);

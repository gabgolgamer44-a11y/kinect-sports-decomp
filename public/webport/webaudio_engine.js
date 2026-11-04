/**
 * Kinect Sports Web Port - Authentic Rare Audio Engine & Fallback Synthesizer
 * Plays authentic Wwise Xbox 360 audio extracted from SoundscapePack/ with procedural fallback.
 * Title ID: 4D5308C9 - Xbox 360 Decompilation Web Port
 */

(function(global) {
    'use strict';

    class KinectSportsAudio {
        constructor() {
            this.ctx = null;
            this.enabled = true;
            this.initialized = false;
            this.audioBuffers = new Map();
            this.soundManifest = {
                football_kick: '/assets/game_sounds/football_kick.mp3',
                football_whistle: '/assets/game_sounds/football_whistle.mp3',
                football_cheer: '/assets/game_sounds/football_cheer.mp3',
                bowling_roll: '/assets/game_sounds/bowling_roll.mp3',
                bowling_strike: '/assets/game_sounds/bowling_strike.mp3',
                boxing_bell: '/assets/game_sounds/boxing_bell.mp3',
                boxing_punch: '/assets/game_sounds/boxing_punch.mp3'
            };
        }

        async init() {
            if (this.initialized) return;
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) {
                    this.ctx = new AudioCtx();
                    this.initialized = true;
                    console.log('[KinectAudio] Authentic WebAudio context initialized.');
                    this.preloadSounds();
                }
            } catch (e) {
                console.warn('[KinectAudio] AudioContext creation failed:', e);
            }
        }

        async preloadSounds() {
            for (const [key, url] of Object.entries(this.soundManifest)) {
                try {
                    const res = await fetch(url);
                    if (res.ok) {
                        const arrayBuf = await res.arrayBuffer();
                        const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
                        this.audioBuffers.set(key, audioBuf);
                        console.log([KinectAudio] Loaded authentic SFX:  (s));
                    }
                } catch (e) {
                    // Fallback to procedural synthesis if fetch/decode fails
                }
            }
        }

        resume() {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        }

        playSoundBuffer(key, fallbackFn) {
            if (!this.ctx || !this.enabled) return;
            this.resume();
            const buf = this.audioBuffers.get(key);
            if (buf) {
                const src = this.ctx.createBufferSource();
                src.buffer = buf;
                const gain = this.ctx.createGain();
                gain.gain.value = 0.85;
                src.connect(gain);
                gain.connect(this.ctx.destination);
                src.start();
                return;
            }
            if (fallbackFn) fallbackFn.call(this);
        }

        playKick() {
            this.playSoundBuffer('football_kick', () => {
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(180, t);
                osc.frequency.exponentialRampToValueAtTime(35, t + 0.18);
                gain.gain.setValueAtTime(1.0, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.22);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(t);
                osc.stop(t + 0.25);
            });
        }

        playWhistle() {
            this.playSoundBuffer('football_whistle', () => {
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(2800, t);
                osc.frequency.setValueAtTime(3200, t + 0.08);
                gain.gain.setValueAtTime(0.6, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(t);
                osc.stop(t + 0.5);
            });
        }

        playCrowdCheer() {
            this.playSoundBuffer('football_cheer', () => {
                const bufferSize = this.ctx.sampleRate * 1.5;
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                const noise = this.ctx.createBufferSource();
                noise.buffer = buffer;
                const filter = this.ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.value = 850;
                filter.Q.value = 1.2;
                const gain = this.ctx.createGain();
                const t = this.ctx.currentTime;
                gain.gain.setValueAtTime(0.01, t);
                gain.gain.linearRampToValueAtTime(0.8, t + 0.3);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 1.4);
                noise.connect(filter);
                filter.connect(gain);
                gain.connect(this.ctx.destination);
                noise.start(t);
                noise.stop(t + 1.5);
            });
        }

        playPinStrike() {
            this.playSoundBuffer('bowling_strike', () => {
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(650, t);
                osc.frequency.exponentialRampToValueAtTime(120, t + 0.15);
                gain.gain.setValueAtTime(0.7, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(t);
                osc.stop(t + 0.35);
            });
        }

        playBoxingHit() {
            this.playSoundBuffer('boxing_punch', () => {
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(140, t);
                osc.frequency.exponentialRampToValueAtTime(30, t + 0.12);
                gain.gain.setValueAtTime(0.9, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(t);
                osc.stop(t + 0.2);
            });
        }

        playBoxingBell() {
            this.playSoundBuffer('boxing_bell', () => {
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1200, t);
                gain.gain.setValueAtTime(0.8, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 1.2);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(t);
                osc.stop(t + 1.3);
            });
        }

        playBowlingRoll() {
            this.playSoundBuffer('bowling_roll', () => {
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(80, t);
                osc.frequency.linearRampToValueAtTime(110, t + 0.8);
                gain.gain.setValueAtTime(0.05, t);
                gain.gain.linearRampToValueAtTime(0.4, t + 0.6);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.85);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(t);
                osc.stop(t + 0.9);
            });
        }

        playVolleyballHit() {
            this.playKick();
        }

        playPingPongBounce() {
            if (!this.ctx || !this.enabled) return;
            this.resume();
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(950, t);
            osc.frequency.exponentialRampToValueAtTime(450, t + 0.04);
            gain.gain.setValueAtTime(0.6, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.06);
        }

        playTrackGun() {
            this.playBoxingBell();
        }

        playBallBounce() {
            this.playKick();
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { KinectSportsAudio };
    }
    if (typeof window !== 'undefined') {
        window.KinectSportsAudio = KinectSportsAudio;
    }
    if (typeof global !== 'undefined') {
        global.KinectSportsAudio = KinectSportsAudio;
    }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

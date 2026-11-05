/**
 * Kinect Sports WebGPU Native Graphics Driver (Padrão playgta5.com)
 * High-performance WGSL Shader Pipeline, Original Texture Sampling & WASM Direct Memory Rendering
 * Title ID: 4D5308C9 - Xbox 360 Decompilation Web Port
 */

(function(global) {
    'use strict';

    const WGSL_SHADER_SOURCE = `
        struct Uniforms {
            projMatrix : mat4x4<f32>,
            viewMatrix : mat4x4<f32>,
            lightPos   : vec3<f32>,
            hasTexture : f32,
            lightColor : vec4<f32>,
            ambient    : vec4<f32>,
            camPos     : vec3<f32>,
            time       : f32,
        };

        @group(0) @binding(0) var<uniform> uniforms : Uniforms;
        @group(0) @binding(1) var u_sampler  : sampler;
        @group(0) @binding(2) var u_texture  : texture_2d<f32>;

        struct VertexInput {
            @location(0) position : vec3<f32>,
            @location(1) normal   : vec3<f32>,
            @location(2) uv       : vec2<f32>,
            @location(3) color    : vec4<f32>,
        };

        struct VertexOutput {
            @builtin(position) clip_position : vec4<f32>,
            @location(0) world_pos : vec3<f32>,
            @location(1) normal    : vec3<f32>,
            @location(2) uv        : vec2<f32>,
            @location(3) color     : vec4<f32>,
        };

        @vertex
        fn vs_main(in : VertexInput) -> VertexOutput {
            var out : VertexOutput;
            let world_pos4 = vec4<f32>(in.position, 1.0);
            out.clip_position = uniforms.projMatrix * uniforms.viewMatrix * world_pos4;
            out.world_pos = in.position;
            out.normal = in.normal;
            out.uv = in.uv;
            out.color = in.color;
            return out;
        }

        @fragment
        fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
            let N = normalize(in.normal);
            let L = normalize(uniforms.lightPos - in.world_pos);
            let V = normalize(uniforms.camPos - in.world_pos);
            let H = normalize(L + V);

            // Diffuse Lambertian
            let diff = max(dot(N, L), 0.0);
            let diffuse = diff * uniforms.lightColor.rgb;

            // Specular Blinn-Phong
            let spec = pow(max(dot(N, H), 0.0), 32.0);
            let specular = spec * uniforms.lightColor.rgb * 0.35;

            // Ambient + Directional
            let lighting = uniforms.ambient.rgb + diffuse + specular;

            // Sample original texture if available
            var baseColor = in.color;
            if (uniforms.hasTexture > 0.5) {
                let texColor = textureSample(u_texture, u_sampler, in.uv);
                baseColor = vec4<f32>(baseColor.rgb * texColor.rgb, baseColor.a * texColor.a);
            }

            let final_rgb = baseColor.rgb * lighting;
            return vec4<f32>(final_rgb, baseColor.a);
        }
    `;

    class WebGPUDriver {
        constructor() {
            this.canvas = null;
            this.context = null;
            this.adapter = null;
            this.device = null;
            this.pipeline = null;
            this.uniformBuffer = null;
            this.uniformBindGroup = null;
            this.vertexBuffer = null;
            this.depthTexture = null;
            this.isSupported = false;
            this.isInitialized = false;
            this.adapterInfo = "Buscando Adaptador...";
            
            this.maxVertices = 65536;
            this.vertexStride = 48; // 3 pos + 3 norm + 2 uv + 4 color = 12 floats * 4 bytes = 48 bytes
            
            this.defaultTexture = null;
            this.defaultSampler = null;
            this.activeTexture = null;
            this.loadedTextures = {};

            this.camera = {
                eye: [0.0, 3.8, -5.2],
                target: [0.0, 1.2, 5.5],
                fov: 60.0 * Math.PI / 180.0
            };
        }

        async init(canvas) {
            this.canvas = canvas;
            if (!navigator.gpu) {
                console.warn('[WebGPU] navigator.gpu não disponível neste navegador. Fallback ativado.');
                this.isSupported = false;
                return false;
            }

            try {
                this.adapter = await navigator.gpu.requestAdapter({
                    powerPreference: 'high-performance'
                });

                if (!this.adapter) {
                    this.isSupported = false;
                    return false;
                }

                if (this.adapter.info) {
                    this.adapterInfo = `${this.adapter.info.vendor || 'GPU'} ${this.adapter.info.architecture || ''} (${this.adapter.info.device || 'Nativa'})`;
                } else {
                    this.adapterInfo = "Acelerador Gráfico WebGPU 1.0 (Nativo)";
                }

                this.device = await this.adapter.requestDevice();
                this.context = this.canvas.getContext('webgpu');
                const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

                this.context.configure({
                    device: this.device,
                    format: presentationFormat,
                    alphaMode: 'premultiplied'
                });

                // Compile WGSL Shaders
                const shaderModule = this.device.createShaderModule({
                    label: 'KinectSports_WGSL_Advanced_Module',
                    code: WGSL_SHADER_SOURCE
                });

                // Create Default 2x2 White Texture & Sampler
                this.defaultSampler = this.device.createSampler({
                    magFilter: 'linear',
                    minFilter: 'linear',
                    addressModeU: 'repeat',
                    addressModeV: 'repeat'
                });

                this.defaultTexture = this.device.createTexture({
                    size: [2, 2, 1],
                    format: 'rgba8unorm',
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
                });

                const whitePixels = new Uint8Array([
                    255, 255, 255, 255,  255, 255, 255, 255,
                    255, 255, 255, 255,  255, 255, 255, 255
                ]);
                this.device.queue.writeTexture(
                    { texture: this.defaultTexture },
                    whitePixels,
                    { bytesPerRow: 8, rowsPerImage: 2 },
                    [2, 2, 1]
                );

                this.activeTexture = this.defaultTexture;

                // Uniform Buffer
                this.uniformBuffer = this.device.createBuffer({
                    size: 256,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
                });

                const bindGroupLayout = this.device.createBindGroupLayout({
                    entries: [
                        {
                            binding: 0,
                            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                            buffer: { type: 'uniform' }
                        },
                        {
                            binding: 1,
                            visibility: GPUShaderStage.FRAGMENT,
                            sampler: { type: 'filtering' }
                        },
                        {
                            binding: 2,
                            visibility: GPUShaderStage.FRAGMENT,
                            texture: { sampleType: 'float' }
                        }
                    ]
                });

                this.bindGroupLayout = bindGroupLayout;
                this.updateBindGroup();

                // Vertex Buffer
                this.vertexBuffer = this.device.createBuffer({
                    size: this.maxVertices * this.vertexStride,
                    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
                });

                // Depth Texture
                this.createDepthTexture();

                // Render Pipeline
                const pipelineLayout = this.device.createPipelineLayout({
                    bindGroupLayouts: [bindGroupLayout]
                });

                this.pipeline = this.device.createRenderPipeline({
                    layout: pipelineLayout,
                    vertex: {
                        module: shaderModule,
                        entryPoint: 'vs_main',
                        buffers: [{
                            arrayStride: this.vertexStride,
                            attributes: [
                                { shaderLocation: 0, offset: 0,  format: 'float32x3' }, // pos
                                { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
                                { shaderLocation: 2, offset: 24, format: 'float32x2' }, // uv
                                { shaderLocation: 3, offset: 32, format: 'float32x4' }  // color
                            ]
                        }]
                    },
                    fragment: {
                        module: shaderModule,
                        entryPoint: 'fs_main',
                        targets: [{ format: presentationFormat }]
                    },
                    primitive: {
                        topology: 'triangle-list',
                        cullMode: 'none'
                    },
                    depthStencil: {
                        depthWriteEnabled: true,
                        depthCompare: 'less',
                        format: 'depth24plus'
                    }
                });

                this.isSupported = true;
                this.isInitialized = true;
                console.log('[WebGPU] Hardware-accelerated WebGPU 1.0 Pipeline initialized com texturização nativa!');
                
                // Load original game textures asynchronously
                this.loadGameTextures();

                return true;
            } catch (err) {
                console.error('[WebGPU] Erro ao inicializar WebGPU:', err);
                this.isSupported = false;
                return false;
            }
        }

        updateBindGroup() {
            if (!this.device || !this.bindGroupLayout) return;
            this.uniformBindGroup = this.device.createBindGroup({
                layout: this.bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: this.uniformBuffer } },
                    { binding: 1, resource: this.defaultSampler },
                    { binding: 2, resource: this.activeTexture.createView() }
                ]
            });
        }

        async loadGameTextures() {
            const texList = [
                { id: 'grass', url: 'assets/game_textures/grass_turf.png' },
                { id: 'target', url: 'assets/game_textures/football_target_gold.png' },
                { id: 'banner_blue', url: 'assets/game_textures/stadium_banner_blue.png' },
                { id: 'banner_red', url: 'assets/game_textures/stadium_banner_red.png' },
                { id: 'bowling_wood', url: 'assets/game_textures/bowling_wood_floor.png' },
                { id: 'boxing_ring', url: 'assets/game_textures/boxing_ring_red.png' },
                { id: 'boxing_crowd', url: 'assets/game_textures/boxing_crowd_arena.png' },
                { id: 'avatar_jersey', url: 'assets/game_textures/avatar_jersey_blue.png' },
                { id: 'avatar_skin', url: 'assets/game_textures/avatar_skin_tone.png' }
            ];

            for (const item of texList) {
                try {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.src = item.url;
                    await img.decode();

                    const bitmap = await createImageBitmap(img);
                    const texture = this.device.createTexture({
                        size: [bitmap.width, bitmap.height, 1],
                        format: 'rgba8unorm',
                        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
                    });

                    this.device.queue.copyExternalImageToTexture(
                        { source: bitmap },
                        { texture: texture },
                        [bitmap.width, bitmap.height]
                    );

                    this.loadedTextures[item.id] = texture;
                    console.log(`[WebGPU] Textura original carregada: ${item.id} (${bitmap.width}x${bitmap.height})`);
                } catch (e) {
                    // Ignore texture load fail
                }
            }

            // Set grass as active texture if available
            if (this.loadedTextures['grass']) {
                this.activeTexture = this.loadedTextures['grass'];
                this.updateBindGroup();
            }
        }

        createDepthTexture() {
            if (!this.device || !this.canvas) return;
            if (this.depthTexture) this.depthTexture.destroy();

            this.depthTexture = this.device.createTexture({
                size: [this.canvas.width || 1280, this.canvas.height || 720, 1],
                format: 'depth24plus',
                usage: GPUTextureUsage.RENDER_ATTACHMENT
            });
        }

        resize(width, height) {
            if (this.canvas) {
                this.canvas.width = width;
                this.canvas.height = height;
                this.createDepthTexture();
            }
        }

        updateUniforms() {
            const aspect = (this.canvas.width || 1280) / (this.canvas.height || 720);
            const proj = this.perspective(this.camera.fov, aspect, 0.1, 150.0);
            const view = this.lookAt(this.camera.eye, this.camera.target, [0, 1, 0]);

            const uniformData = new Float32Array(64);
            uniformData.set(proj, 0);   // 16 floats (0..15)
            uniformData.set(view, 16);  // 16 floats (16..31)
            
            // lightPos
            uniformData[32] = 8.0; uniformData[33] = 16.0; uniformData[34] = 4.0;
            // hasTexture flag
            uniformData[35] = (this.activeTexture !== this.defaultTexture) ? 1.0 : 0.0;
            // lightColor
            uniformData[36] = 1.0; uniformData[37] = 0.98; uniformData[38] = 0.95; uniformData[39] = 1.0;
            // ambient
            uniformData[40] = 0.42; uniformData[41] = 0.45; uniformData[42] = 0.48; uniformData[43] = 1.0;
            // camPos
            uniformData[44] = this.camera.eye[0]; uniformData[45] = this.camera.eye[1]; uniformData[46] = this.camera.eye[2];
            // time
            uniformData[47] = performance.now() / 1000.0;

            this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData.buffer, 0, 256);
        }

        renderFromWasmMemory(wasmMemoryBuffer, vertexOffset, vertexCount) {
            if (!this.isInitialized || vertexCount === 0 || !this.context) return;

            try {
                const byteLength = vertexCount * this.vertexStride;
                const vertexView = new Uint8Array(wasmMemoryBuffer, vertexOffset, byteLength);

                // Upload WASM vertex buffer directly to GPU
                this.device.queue.writeBuffer(this.vertexBuffer, 0, vertexView.buffer, vertexView.byteOffset, byteLength);
                this.updateUniforms();

                const currentTexture = this.context.getCurrentTexture();
                if (!currentTexture) return;

                const commandEncoder = this.device.createCommandEncoder();
                const textureView = currentTexture.createView();

                const renderPass = commandEncoder.beginRenderPass({
                    colorAttachments: [{
                        view: textureView,
                        clearValue: { r: 0.04, g: 0.07, b: 0.12, a: 1.0 },
                        loadOp: 'clear',
                        storeOp: 'store'
                    }],
                    depthStencilAttachment: {
                        view: this.depthTexture.createView(),
                        depthClearValue: 1.0,
                        depthLoadOp: 'clear',
                        depthStoreOp: 'store'
                    }
                });

                renderPass.setPipeline(this.pipeline);
                renderPass.setBindGroup(0, this.uniformBindGroup);
                renderPass.setVertexBuffer(0, this.vertexBuffer);
                renderPass.draw(vertexCount);
                renderPass.end();

                this.device.queue.submit([commandEncoder.finish()]);
            } catch (renderErr) {
                // Ignore transient frame skips on resize
            }
        }

        perspective(fov, aspect, near, far) {
            const f = 1.0 / Math.tan(fov / 2);
            const nf = 1 / (near - far);
            return [
                f / aspect, 0, 0, 0,
                0, f, 0, 0,
                0, 0, (far + near) * nf, -1,
                0, 0, 2 * far * near * nf, 0
            ];
        }

        lookAt(eye, center, up) {
            let z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
            let len = Math.hypot(z0, z1, z2);
            if (len > 0) { z0 /= len; z1 /= len; z2 /= len; }

            let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
            len = Math.hypot(x0, x1, x2);
            if (len > 0) { x0 /= len; x1 /= len; x2 /= len; }

            let y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;

            return [
                x0, y0, z0, 0,
                x1, y1, z1, 0,
                x2, y2, z2, 0,
                -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
                -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
                -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
                1
            ];
        }
    }

    global.WebGPUDriver = new WebGPUDriver();
})(typeof window !== 'undefined' ? window : this);

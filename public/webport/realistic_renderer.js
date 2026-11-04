/**
 * Kinect Sports Realistic 3D Renderer (Three.js Powered)
 * High-Fidelity 3D Arenas, Official Textures, Dynamic Lighting & PBR Materials
 * Title ID: 4D5308C9 (Xbox 360)
 */

(function(global) {
  'use strict';

  class RealisticKinectRenderer {
    constructor(canvasId) {
      this.currentSport = 1; // 1: Football, 2: Bowling, 3: Boxing, 4: Volleyball, 5: Table Tennis, 6: Track
      this.ballPos = new Float32Array([0, 0.22, 2.0]);
      this.ballRot = new Float32Array([0, 0, 0]);
      this.prevBallPos = new Float32Array([0, 0.22, 2.0]);
      this.skeletonData = null;
      this.drawCallCount = 0;

      // Dynamic Resolution Scaling (DRS) & Performance Metrics
      this.currentPreset = 'balanced'; // 'ultra' | 'balanced' | 'performance'
      this.drsEnabled = true;
      this.minPixelRatio = 0.7;
      this.maxPixelRatio = 1.35;
      this.currentPixelRatio = 1.0;
      this.targetFrameTimeMs = 16.666; // 60 FPS target
      this.frameTimeHistory = new Float32Array(30);
      this.historyIndex = 0;
      this.historyCount = 0;
      this.frameTimeMs = 16.6;
      this.fps = 60;
      this.rollingFps = 60;
      this.lastFrameTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      this.drsAdjustmentCooldown = 0;

      // Skeletal topology
      this.jointIndices = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32];
      this.boneConnections = [
        [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
        [11, 23], [12, 24], [23, 24],
        [23, 25], [25, 27], [27, 31],
        [24, 26], [26, 28], [28, 32],
        [0, 11], [0, 12]
      ];
      this.jointMeshes = [];
      this._jointPositions = {};
      const makeVec = () => ({
        x: 0, y: 0, z: 0,
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
      });
      this.jointIndices.forEach(idx => {
        this._jointPositions[idx] = (typeof THREE !== 'undefined' && THREE.Vector3) ? new THREE.Vector3(0, 0, 0) : makeVec();
      });

      if (typeof document === 'undefined') {
        return; // Headless testing support
      }

      this.canvas = (typeof canvasId === 'string') ? document.getElementById(canvasId) : canvasId;
      if (!this.canvas) {
        console.error('Canvas not found:', canvasId);
        return;
      }

      this.clock = (typeof THREE !== 'undefined' && THREE.Clock) ? new THREE.Clock() : null;

      if (typeof THREE !== 'undefined') {
        this.initThree();
        this.buildStadium();
        this.buildBall();
        this.buildSkeleton();
        this.setupCamera();
        this.setPreset('balanced');
        this.precompileShaders();
      }
      
      this.resize();
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('resize', () => this.resize());
      }
    }

    initThree() {
      // 1. Scene
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x060913);
      this.scene.fog = new THREE.FogExp2(0x0a1020, 0.015);

      // 2. Camera
      const aspect = (this.canvas.clientWidth || 800) / (this.canvas.clientHeight || 450);
      this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200);
      this.camera.position.set(0, 3.2, -4.5);
      this.camera.lookAt(0, 1.2, 10.0);

      // 3. WebGL Renderer with High-Performance hint
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        precision: 'highp',
        stencil: false
      });
      this.renderer.setSize(this.canvas.clientWidth || 800, this.canvas.clientHeight || 450, false);
      this.renderer.setPixelRatio(this.currentPixelRatio);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;

      // 4. Lighting
      this.setupLighting();
    }

    setupLighting() {
      // Ambient Light
      this.ambientLight = new THREE.AmbientLight(0x7090b0, 0.65);
      this.scene.add(this.ambientLight);

      // Main Stadium Floodlight (Key light with shadows)
      this.floodlight1 = new THREE.DirectionalLight(0xfffaed, 1.4);
      this.floodlight1.position.set(15, 25, -10);
      this.floodlight1.castShadow = true;
      this.floodlight1.shadow.mapSize.width = 1024;
      this.floodlight1.shadow.mapSize.height = 1024;
      this.floodlight1.shadow.camera.near = 5;
      this.floodlight1.shadow.camera.far = 80;
      this.floodlight1.shadow.camera.left = -20;
      this.floodlight1.shadow.camera.right = 20;
      this.floodlight1.shadow.camera.top = 20;
      this.floodlight1.shadow.camera.bottom = -10;
      this.floodlight1.shadow.bias = -0.001;
      this.scene.add(this.floodlight1);

      // Secondary Stadium Floodlight (Fill light - blueish sports arena glow)
      this.floodlight2 = new THREE.DirectionalLight(0x4080ff, 0.8);
      this.floodlight2.position.set(-15, 20, 20);
      this.scene.add(this.floodlight2);

      // Green Xbox Kinect signature spotlight on player
      this.playerSpotlight = new THREE.SpotLight(0x10b981, 1.2, 15, Math.PI / 4, 0.5, 1);
      this.playerSpotlight.position.set(0, 6, 0);
      this.playerSpotlight.target.position.set(0, 0, 1.5);
      this.scene.add(this.playerSpotlight);
    }

    triggerCelebration() {
      this.confettiActive = true;
      this.confettiTimer = 3.5; // 3.5 seconds of celebratory confetti
      if (this.confettiParticles && this.confettiParticles.material) {
        this.confettiParticles.material.opacity = 0.95;
      }
    }

    setupCamera() {
      // Optional OrbitControls if available
      if (typeof THREE.OrbitControls !== 'undefined') {
        this.controls = new THREE.OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
        this.controls.minDistance = 2;
        this.controls.maxDistance = 40;
        this.controls.target.set(0, 1.2, 6.0);
      }
    }

    buildStadium() {
      this.sportsArenas = new THREE.Group();
      this.scene.add(this.sportsArenas);

      // 1. Crowd / Stadium Backdrop Billboard (Using Official nxebg.jpg artwork!)
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load('assets/nxebg.jpg', (tex) => {
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        
        // Curved panoramic stadium crowd screen
        const backdropGeo = new THREE.CylinderGeometry(40, 40, 22, 32, 1, true, -Math.PI / 2, Math.PI);
        const backdropMat = new THREE.MeshBasicMaterial({
          map: tex,
          side: THREE.BackSide,
          fog: true
        });
        const backdropMesh = new THREE.Mesh(backdropGeo, backdropMat);
        backdropMesh.position.set(0, 8, 12);
        backdropMesh.rotation.y = Math.PI;
        this.scene.add(backdropMesh);
      });

      // Build each of the 6 sports arenas
      this.arenaGroups = {
        1: this.buildFootballArena(),
        2: this.buildBowlingArena(),
        3: this.buildBoxingArena(),
        4: this.buildVolleyballArena(),
        5: this.buildTableTennisArena(),
        6: this.buildTrackArena()
      };

      // Add all arenas, activate sport 1
      for (const id in this.arenaGroups) {
        this.sportsArenas.add(this.arenaGroups[id]);
        this.arenaGroups[id].visible = (parseInt(id, 10) === this.currentSport);
      }

      // Confetti celebration particle system
      const confettiCount = 120;
      const confettiGeo = new THREE.BufferGeometry();
      const confettiPositions = new Float32Array(confettiCount * 3);
      const confettiColors = new Float32Array(confettiCount * 3);
      const colors = [ [0.06, 0.72, 0.5], [0.96, 0.62, 0.04], [0.94, 0.27, 0.27], [0.23, 0.51, 0.96], [1.0, 1.0, 1.0] ];
      for (let i = 0; i < confettiCount; i++) {
        confettiPositions[i * 3 + 0] = (Math.random() - 0.5) * 16;
        confettiPositions[i * 3 + 1] = Math.random() * 8 + 4;
        confettiPositions[i * 3 + 2] = Math.random() * 20 + 5;
        const c = colors[i % colors.length];
        confettiColors[i * 3 + 0] = c[0];
        confettiColors[i * 3 + 1] = c[1];
        confettiColors[i * 3 + 2] = c[2];
      }
      confettiGeo.setAttribute('position', new THREE.BufferAttribute(confettiPositions, 3));
      confettiGeo.setAttribute('color', new THREE.BufferAttribute(confettiColors, 3));
      const confettiMat = new THREE.PointsMaterial({ size: 0.2, vertexColors: true, transparent: true, opacity: 0.0 });
      this.confettiParticles = new THREE.Points(confettiGeo, confettiMat);
      this.scene.add(this.confettiParticles);
      this.confettiActive = false;
      this.confettiTimer = 0;
    }

    // ==========================================
    // SPORT 1: FOOTBALL (SOCCER) ARENA
    // ==========================================
    buildFootballArena() {
      const group = new THREE.Group();

      // Pitch Grass with procedural shader / striped texture
      const pitchGeo = new THREE.PlaneGeometry(36, 60, 36, 60);
      const canvasTex = document.createElement('canvas');
      canvasTex.width = 512;
      canvasTex.height = 1024;
      const ctx = canvasTex.getContext('2d');
      // Alternate vibrant grass stripes
      for (let y = 0; y < 1024; y += 64) {
        ctx.fillStyle = ((y / 64) % 2 === 0) ? '#286e2d' : '#33883a';
        ctx.fillRect(0, y, 512, 64);
      }
      // Pitch lines
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 10;
      ctx.strokeRect(20, 20, 472, 984);
      // Penalty box
      ctx.strokeRect(100, 750, 312, 254);
      // Goal area
      ctx.strokeRect(160, 890, 192, 114);
      // Penalty spot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(256, 820, 10, 0, Math.PI * 2);
      ctx.fill();

      const grassTexture = new THREE.CanvasTexture(canvasTex);
      grassTexture.wrapS = THREE.ClampToEdgeWrapping;
      grassTexture.wrapT = THREE.ClampToEdgeWrapping;

      const pitchMat = new THREE.MeshStandardMaterial({
        map: grassTexture,
        roughness: 0.8,
        metalness: 0.1
      });
      const pitch = new THREE.Mesh(pitchGeo, pitchMat);
      pitch.rotation.x = -Math.PI / 2;
      pitch.position.set(0, 0, 15);
      pitch.receiveShadow = true;
      group.add(pitch);

      // Official 3D Football Goal Posts (White tubes + Crossbar + Net)
      const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.8 });
      const postRadius = 0.08;
      const goalWidth = 7.32;
      const goalHeight = 2.44;
      const goalDepth = 2.0;
      const goalZ = 25.0;

      // Left post
      const leftPost = new THREE.Mesh(new THREE.CylinderGeometry(postRadius, postRadius, goalHeight, 16), postMat);
      leftPost.position.set(-goalWidth / 2, goalHeight / 2, goalZ);
      leftPost.castShadow = true;
      group.add(leftPost);

      // Right post
      const rightPost = new THREE.Mesh(new THREE.CylinderGeometry(postRadius, postRadius, goalHeight, 16), postMat);
      rightPost.position.set(goalWidth / 2, goalHeight / 2, goalZ);
      rightPost.castShadow = true;
      group.add(rightPost);

      // Crossbar
      const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(postRadius, postRadius, goalWidth, 16), postMat);
      crossbar.rotation.z = Math.PI / 2;
      crossbar.position.set(0, goalHeight, goalZ);
      crossbar.castShadow = true;
      group.add(crossbar);

      // Net (Backing box with semi-transparent wireframe mesh)
      const netGeo = new THREE.BoxGeometry(goalWidth, goalHeight, goalDepth);
      const netMat = new THREE.MeshBasicMaterial({ color: 0xdddddd, wireframe: true, transparent: true, opacity: 0.35 });
      const net = new THREE.Mesh(netGeo, netMat);
      net.position.set(0, goalHeight / 2, goalZ + goalDepth / 2);
      group.add(net);

      // Stadium side LED boards
      const ledMat = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.4 });
      const boardLeft = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 50), ledMat);
      boardLeft.position.set(-18, 0.6, 15);
      group.add(boardLeft);

      const boardRight = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 50), ledMat);
      boardRight.position.set(18, 0.6, 15);
      group.add(boardRight);

            // 3D Animated Goalkeeper
      this.goalkeeper = new THREE.Group();
      this.goalkeeper.position.set(0, 0, 24.2);
      const gkJerseyMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 }); // Vibrant yellow
      const gkSkinMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.5 });
      const gkShortsMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
      const gkGloveMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.2, metalness: 0.3 });

      const gkTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.65, 12), gkJerseyMat);
      gkTorso.position.y = 1.15;
      gkTorso.castShadow = true;
      this.goalkeeper.add(gkTorso);

      const gkHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), gkSkinMat);
      gkHead.position.y = 1.62;
      this.goalkeeper.add(gkHead);

      this.gkLeftGlove = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), gkGloveMat);
      this.gkLeftGlove.position.set(-0.6, 1.15, 0.1);
      this.goalkeeper.add(this.gkLeftGlove);

      this.gkRightGlove = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), gkGloveMat);
      this.gkRightGlove.position.set(0.6, 1.15, 0.1);
      this.goalkeeper.add(this.gkRightGlove);

      const gkShorts = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.35, 12), gkShortsMat);
      gkShorts.position.y = 0.72;
      this.goalkeeper.add(gkShorts);

      const gkLegL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), gkSkinMat);
      gkLegL.position.set(-0.14, 0.32, 0);
      this.goalkeeper.add(gkLegL);
      const gkLegR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), gkSkinMat);
      gkLegR.position.set(0.14, 0.32, 0);
      this.goalkeeper.add(gkLegR);

      group.add(this.goalkeeper);
      this.gkDiving = false;
      this.gkDiveTargetX = 0;

      return group;
    }

    // ==========================================
    // SPORT 2: BOWLING ALLEY
    // ==========================================
    buildBowlingArena() {
      const group = new THREE.Group();

      // Polished Maple Wood Lane
      const laneCanvas = document.createElement('canvas');
      laneCanvas.width = 256;
      laneCanvas.height = 1024;
      const lctx = laneCanvas.getContext('2d');
      // Maple wood boards
      for (let x = 0; x < 256; x += 16) {
        lctx.fillStyle = (x % 32 === 0) ? '#e6af74' : '#f0be86';
        lctx.fillRect(x, 0, 16, 1024);
      }
      // Arrows on lane
      lctx.fillStyle = '#613b11';
      for (let i = -3; i <= 3; i++) {
        const ax = 128 + i * 28;
        lctx.beginPath();
        lctx.moveTo(ax, 700);
        lctx.lineTo(ax - 10, 730);
        lctx.lineTo(ax + 10, 730);
        lctx.fill();
      }

      const laneTex = new THREE.CanvasTexture(laneCanvas);
      const laneMat = new THREE.MeshStandardMaterial({
        map: laneTex,
        roughness: 0.15, // Shiny reflection
        metalness: 0.05
      });
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 24), laneMat);
      lane.rotation.x = -Math.PI / 2;
      lane.position.set(0, 0, 10);
      lane.receiveShadow = true;
      group.add(lane);

      // Gutters (Dark curved metal)
      const gutterMat = new THREE.MeshStandardMaterial({ color: 0x222630, roughness: 0.4 });
      const leftGutter = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 24), gutterMat);
      leftGutter.position.set(-1.22, -0.06, 10);
      group.add(leftGutter);

      const rightGutter = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 24), gutterMat);
      rightGutter.position.set(1.22, -0.06, 10);
      group.add(rightGutter);

      // 10 3D Bowling Pins (White with dual red stripes)
      this.bowlingPins = [];
      const pinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
      const pinStripeMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.2 });

      const pinRows = [
        [ [0, 20.0] ], // Row 1 (Head pin)
        [ [-0.2, 20.35], [0.2, 20.35] ], // Row 2
        [ [-0.4, 20.7], [0, 20.7], [0.4, 20.7] ], // Row 3
        [ [-0.6, 21.05], [-0.2, 21.05], [0.2, 21.05], [0.6, 21.05] ] // Row 4
      ];

      pinRows.forEach((row) => {
        row.forEach(([px, pz]) => {
          const pinGroup = new THREE.Group();
          // Pin body (cylinder/sphere combo)
          const pinBody = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.38, 16), pinMat);
          pinBody.position.y = 0.19;
          pinBody.castShadow = true;
          pinGroup.add(pinBody);

          // Top sphere head
          const pinHead = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), pinMat);
          pinHead.position.y = 0.38;
          pinGroup.add(pinHead);

          // Red neck stripe
          const pinStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.03, 16), pinStripeMat);
          pinStripe.position.y = 0.32;
          pinGroup.add(pinStripe);

          pinGroup.position.set(px, 0, pz);
          group.add(pinGroup);
          this.bowlingPins.push(pinGroup);
        });
      });

      // Pinsetter backwall
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.5), new THREE.MeshStandardMaterial({ color: 0x111625 }));
      backWall.position.set(0, 1.5, 22.5);
      group.add(backWall);

      return group;
    }

    // ==========================================
    // SPORT 3: BOXING RING
    // ==========================================
    buildBoxingArena() {
      const group = new THREE.Group();
      // Blue Canvas Ring Mat
      const canvasMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.7 });
      const ringMat = new THREE.Mesh(new THREE.BoxGeometry(8, 0.8, 8), canvasMat);
      ringMat.position.set(0, 0.4, 7);
      ringMat.receiveShadow = true;
      group.add(ringMat);

      // 4 Corner Posts (Red, Blue, White)
      const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.4, 16);
      const postColors = [0xef4444, 0x3b82f6, 0xffffff, 0xffffff];
      const postCoords = [ [-3.8, 3.2], [3.8, 3.2], [-3.8, 10.8], [3.8, 10.8] ];
      postCoords.forEach(([px, pz], i) => {
        const post = new THREE.Mesh(postGeo, new THREE.MeshStandardMaterial({ color: postColors[i], metalness: 0.6 }));
        post.position.set(px, 1.6, pz);
        post.castShadow = true;
        group.add(post);
      });

      // 3 Ropes around ring
      [1.0, 1.5, 2.0].forEach((ry) => {
        const ropeGeo = new THREE.BoxGeometry(7.6, 0.04, 7.6);
        const ropeMat = new THREE.MeshStandardMaterial({ color: 0xef4444, wireframe: true });
        const rope = new THREE.Mesh(ropeGeo, ropeMat);
        rope.position.set(0, ry, 7);
        group.add(rope);
      });

            // 3D Opponent Boxer (Red Corner)
      this.opponentBoxer = new THREE.Group();
      this.opponentBoxer.position.set(0, 0, 8.5);
      const oppSkin = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 });
      const oppTrunks = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.4 });
      const oppGloveMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.2, metalness: 0.2 });

      const oppTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.75, 12), oppSkin);
      oppTorso.position.y = 1.3;
      oppTorso.castShadow = true;
      this.opponentBoxer.add(oppTorso);

      this.oppHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), oppSkin);
      this.oppHead.position.y = 1.8;
      this.opponentBoxer.add(this.oppHead);

      this.oppGloveL = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), oppGloveMat);
      this.oppGloveL.position.set(-0.35, 1.4, -0.4);
      this.opponentBoxer.add(this.oppGloveL);

      this.oppGloveR = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), oppGloveMat);
      this.oppGloveR.position.set(0.35, 1.4, -0.4);
      this.opponentBoxer.add(this.oppGloveR);

      const oppShorts = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.4, 12), oppTrunks);
      oppShorts.position.y = 0.85;
      this.opponentBoxer.add(oppShorts);

      group.add(this.opponentBoxer);

      return group;
    }

    // ==========================================
    // SPORT 4: BEACH VOLLEYBALL
    // ==========================================
    buildVolleyballArena() {
      const group = new THREE.Group();
      // Golden Sand
      const sandMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.9 });
      const court = new THREE.Mesh(new THREE.PlaneGeometry(16, 24), sandMat);
      court.rotation.x = -Math.PI / 2;
      court.position.set(0, 0, 10);
      court.receiveShadow = true;
      group.add(court);

      // Net
      const net = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }));
      net.position.set(0, 2.4, 10);
      group.add(net);

      return group;
    }

    // ==========================================
    // SPORT 5: TABLE TENNIS
    // ==========================================
    buildTableTennisArena() {
      const group = new THREE.Group();
      // Blue Ping Pong Table
      const tableMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.3 });
      const table = new THREE.Mesh(new THREE.BoxGeometry(2.74, 0.08, 1.525), tableMat);
      table.position.set(0, 0.76, 3.5);
      table.rotation.y = Math.PI / 2;
      table.receiveShadow = true;
      group.add(table);

      // Table legs
      const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.76, 8);
      const legMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
      [ [-0.6, 2.3], [0.6, 2.3], [-0.6, 4.7], [0.6, 4.7] ].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(lx, 0.38, lz);
        group.add(leg);
      });

      // Net
      const net = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }));
      net.position.set(0, 0.84, 3.5);
      group.add(net);

            // 3D Table Tennis Opponent
      this.ttOpponent = new THREE.Group();
      this.ttOpponent.position.set(0, 0, 5.2);
      const ttShirtMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 });
      const ttSkinMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 });
      const ttPaddleMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3 });

      const ttTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.6, 10), ttShirtMat);
      ttTorso.position.y = 1.1;
      this.ttOpponent.add(ttTorso);

      const ttHead = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), ttSkinMat);
      ttHead.position.y = 1.5;
      this.ttOpponent.add(ttHead);

      this.ttPaddle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16), ttPaddleMat);
      this.ttPaddle.rotation.x = Math.PI / 2;
      this.ttPaddle.position.set(0.3, 0.95, -0.3);
      this.ttOpponent.add(this.ttPaddle);

      group.add(this.ttOpponent);

      return group;
    }

    // ==========================================
    // SPORT 6: TRACK & FIELD
    // ==========================================
    buildTrackArena() {
      const group = new THREE.Group();
      // Red Tartan Track with 4 white lanes
      const trackMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.8 });
      const track = new THREE.Mesh(new THREE.PlaneGeometry(10, 80), trackMat);
      track.rotation.x = -Math.PI / 2;
      track.position.set(0, 0, 30);
      track.receiveShadow = true;
      group.add(track);

      // Hurdles along track
      const hurdleMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.5 });
      for (let z = 12; z <= 50; z += 12) {
        const hurdle = new THREE.Mesh(new THREE.BoxGeometry(6, 0.9, 0.08), hurdleMat);
        hurdle.position.set(0, 0.45, z);
        hurdle.castShadow = true;
        group.add(hurdle);
      }

      return group;
    }

    // ==========================================
    // 3D BALL WITH REAL TEXTURES & SHADOWS
    // ==========================================
    buildBall() {
      // 1. Procedural High-Definition Soccer Ball Texture
      const ballCanvas = document.createElement('canvas');
      ballCanvas.width = 512;
      ballCanvas.height = 256;
      const bctx = ballCanvas.getContext('2d');
      bctx.fillStyle = '#f8fafc';
      bctx.fillRect(0, 0, 512, 256);
      // Black pentagons
      bctx.fillStyle = '#0f172a';
      for (let x = 32; x < 512; x += 96) {
        for (let y = 32; y < 256; y += 96) {
          bctx.beginPath();
          bctx.arc(x, y, 24, 0, Math.PI * 2);
          bctx.fill();
        }
      }
      const ballTex = new THREE.CanvasTexture(ballCanvas);

      const ballGeo = new THREE.SphereGeometry(0.22, 32, 32);
      this.ballMat = new THREE.MeshStandardMaterial({
        map: ballTex,
        roughness: 0.25,
        metalness: 0.1
      });

      this.ballMesh = new THREE.Mesh(ballGeo, this.ballMat);
      this.ballMesh.position.set(0, 0.22, 2.0);
      this.ballMesh.castShadow = true;
      this.ballMesh.receiveShadow = true;
      this.scene.add(this.ballMesh);
    }

    // ==========================================
    // KINECT 3D AVATAR SKELETON (GLOWING BONES & JOINTS)
    // ==========================================
    buildSkeleton() {
      this.skeletonGroup = new THREE.Group();
      this.scene.add(this.skeletonGroup);

      // Humanoid avatar joints (15 anatomical key joints mapped from MediaPipe & Kinect NUI)
      this.jointIndices = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32];
      this.jointMeshes = [];
      const jointGeo = new THREE.SphereGeometry(0.045, 12, 12);
      const jointMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.8
      });

      for (let i = 0; i < this.jointIndices.length; i++) {
        const jm = new THREE.Mesh(jointGeo, jointMat);
        jm.visible = false;
        this.skeletonGroup.add(jm);
        this.jointMeshes.push(jm);
      }

      // Anatomical bone connection lines matching humanoid skeleton
      this.boneConnections = [
        [11, 12], // Shoulders
        [11, 13], [13, 15], // Left Arm
        [12, 14], [14, 16], // Right Arm
        [11, 23], [12, 24], [23, 24], // Torso
        [23, 25], [25, 27], [27, 31], // Left Leg
        [24, 26], [26, 28], [28, 32], // Right Leg
        [0, 11], [0, 12] // Head/Neck to Shoulders
      ];

      const lineGeo = new THREE.BufferGeometry();
      const linePositions = new Float32Array(this.boneConnections.length * 2 * 3);
      lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
      const lineMat = new THREE.LineBasicMaterial({ color: 0x34d399, linewidth: 3 });
      this.boneLines = new THREE.LineSegments(lineGeo, lineMat);
      this.skeletonGroup.add(this.boneLines);

      // Full 3D Humanoid Xbox Avatar Mesh
      this.avatarGroup = new THREE.Group();
      this.skeletonGroup.add(this.avatarGroup);

      const avatarJerseyMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.35 });
      const avatarSkinMat = new THREE.MeshStandardMaterial({ color: 0xfcd34d, roughness: 0.5 });
      const avatarShortsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
      const avatarShoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });

      this.avatarHead = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), avatarSkinMat);
      this.avatarGroup.add(this.avatarHead);

      this.avatarTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.20, 0.55, 12), avatarJerseyMat);
      this.avatarGroup.add(this.avatarTorso);

      this.avatarShorts = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 12), avatarShortsMat);
      this.avatarGroup.add(this.avatarShorts);

      this.avatarShoeL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.22), avatarShoeMat);
      this.avatarShoeR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.22), avatarShoeMat);
      this.avatarGroup.add(this.avatarShoeL);
      this.avatarGroup.add(this.avatarShoeR);

      // Pre-allocated vector cache for Zero-GC skeleton updates
      this._jointPositions = {};
      this.jointIndices.forEach(idx => {
        this._jointPositions[idx] = new THREE.Vector3(0, 0, 0);
      });
    }

    // ==========================================
    // UPDATE & RENDER LOOP
    // ==========================================
    setSport(sportId) {
      this.currentSport = sportId;
      if (this.arenaGroups) {
        for (const id in this.arenaGroups) {
          this.arenaGroups[id].visible = (parseInt(id, 10) === sportId);
        }
      }

      // Customize ball look and visibility per sport
      if (this.ballMesh) {
        if (sportId === 1) { // Football
          this.ballMesh.visible = true;
          this.ballMesh.scale.set(1.0, 1.0, 1.0);
          this.ballMat.color.setHex(0xffffff);
          this.ballMat.roughness = 0.25;
          this.ballMat.metalness = 0.1;
        } else if (sportId === 2) { // Bowling
          this.ballMesh.visible = true;
          this.ballMesh.scale.set(1.0, 1.0, 1.0);
          this.ballMat.color.setHex(0x111827);
          this.ballMat.map = null;
          this.ballMat.roughness = 0.05;
          this.ballMat.metalness = 0.8;
        } else if (sportId === 3) { // Boxing (no ball)
          this.ballMesh.visible = false;
        } else if (sportId === 4) { // Volleyball
          this.ballMesh.visible = true;
          this.ballMesh.scale.set(1.1, 1.1, 1.1);
          this.ballMat.color.setHex(0xfef08a);
          this.ballMat.roughness = 0.4;
          this.ballMat.metalness = 0.05;
        } else if (sportId === 5) { // Table Tennis
          this.ballMesh.visible = true;
          this.ballMesh.scale.set(0.18, 0.18, 0.18);
          this.ballMat.color.setHex(0xf97316);
          this.ballMat.roughness = 0.2;
          this.ballMat.metalness = 0.0;
        } else if (sportId === 6) { // Track & Field (no ball)
          this.ballMesh.visible = false;
        }
      }
    }

    setPreset(presetName) {
      const mode = (presetName || 'balanced').toLowerCase();
      console.log(`[RealisticRenderer] Switching to performance preset: ${mode.toUpperCase()}`);
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1.0;
      
      if (mode === 'ultra') {
        this.currentPreset = 'ultra';
        this.targetFrameTimeMs = 16.666; // 60 FPS
        this.minPixelRatio = 0.85;
        this.maxPixelRatio = Math.min(dpr, 2.0);
        this.currentPixelRatio = Math.min(this.maxPixelRatio, Math.max(1.0, dpr));
        
        if (this.renderer) {
          this.renderer.shadowMap.enabled = true;
          this.renderer.shadowMap.type = (typeof THREE !== 'undefined' && THREE.PCFSoftShadowMap) ? THREE.PCFSoftShadowMap : 2;
          this.renderer.toneMappingExposure = 1.15;
          this.renderer.setPixelRatio(this.currentPixelRatio);
        }
        if (this.floodlight1) {
          this.floodlight1.castShadow = true;
          this.floodlight1.shadow.mapSize.set(1024, 1024);
        }
        if (this.floodlight2) this.floodlight2.visible = true;
        if (this.playerSpotlight) this.playerSpotlight.visible = true;
        
        // Full PBR & detailed shadows on objects
        if (this.scene) {
          this.scene.traverse((obj) => {
            if (obj.isMesh && obj !== this.boneLines) {
              obj.castShadow = true;
              obj.receiveShadow = true;
              if (obj.material) {
                obj.material.roughness = 0.4;
                obj.material.metalness = 0.15;
                obj.material.needsUpdate = true;
              }
            }
          });
        }
      } else if (mode === 'performance' || mode === 'desempenho') {
        this.currentPreset = 'performance';
        this.targetFrameTimeMs = 8.333; // Target > 120 FPS
        this.minPixelRatio = 0.5;
        this.maxPixelRatio = 1.0;
        this.currentPixelRatio = Math.min(1.0, dpr);
        
        if (this.renderer) {
          this.renderer.shadowMap.enabled = false;
          this.renderer.setPixelRatio(this.currentPixelRatio);
        }
        if (this.floodlight1) this.floodlight1.castShadow = false;
        if (this.floodlight2) this.floodlight2.visible = false;
        if (this.playerSpotlight) this.playerSpotlight.visible = true;

        // Basic materials and zero shadows for maximum throughput (>120 FPS)
        if (this.scene) {
          this.scene.traverse((obj) => {
            if (obj.isMesh) {
              obj.castShadow = false;
              obj.receiveShadow = false;
              if (obj.material) {
                obj.material.roughness = 1.0;
                obj.material.metalness = 0.0;
                obj.material.needsUpdate = true;
              }
            }
          });
        }
      } else { // 'balanced' (default)
        this.currentPreset = 'balanced';
        this.targetFrameTimeMs = 16.666; // Target 60 FPS
        this.minPixelRatio = 0.7;
        this.maxPixelRatio = Math.min(dpr, 1.35);
        this.currentPixelRatio = 1.0;

        if (this.renderer) {
          this.renderer.shadowMap.enabled = true;
          this.renderer.shadowMap.type = (typeof THREE !== 'undefined' && THREE.PCFShadowMap) ? THREE.PCFShadowMap : 1;
          this.renderer.toneMappingExposure = 1.1;
          this.renderer.setPixelRatio(this.currentPixelRatio);
        }
        if (this.floodlight1) {
          this.floodlight1.castShadow = true;
          this.floodlight1.shadow.mapSize.set(512, 512);
        }
        if (this.floodlight2) this.floodlight2.visible = true;
        if (this.playerSpotlight) this.playerSpotlight.visible = true;

        if (this.scene) {
          this.scene.traverse((obj) => {
            if (obj.isMesh) {
              // Ball and key props cast shadows; stadium surfaces receive shadows
              obj.castShadow = (obj === this.ballMesh);
              obj.receiveShadow = true;
              if (obj.material) {
                obj.material.roughness = 0.6;
                obj.material.metalness = 0.05;
                obj.material.needsUpdate = true;
              }
            }
          });
        }
      }

      if (this.renderer && this.renderer.shadowMap) {
        this.renderer.shadowMap.needsUpdate = true;
      }
    }

    precompileShaders() {
      if (!this.renderer || !this.scene || !this.camera) return;
      try {
        console.log('[RealisticRenderer] Pre-compiling WebGL shaders for all 6 sports stadiums...');
        if (this.arenaGroups) {
          for (const id in this.arenaGroups) {
            this.arenaGroups[id].visible = true;
          }
        }
        this.renderer.compile(this.scene, this.camera);

        // Restore active sport visibility
        if (this.arenaGroups) {
          for (const id in this.arenaGroups) {
            this.arenaGroups[id].visible = (parseInt(id, 10) === this.currentSport);
          }
        }
        console.log('[RealisticRenderer] Shaders pre-compiled successfully. No switch lag.');
      } catch (err) {
        console.warn('[RealisticRenderer] Shader pre-compilation warning:', err);
      }
    }

    setBallPosition(x, y, z) {
      this.setBallPos(x, y, z);
    }

    setBallPos(x, y, z) {
      // Zero-GC: update Float32Array in place
      this.prevBallPos[0] = this.ballPos[0];
      this.prevBallPos[1] = this.ballPos[1];
      this.prevBallPos[2] = this.ballPos[2];

      this.ballPos[0] = x;
      this.ballPos[1] = y;
      this.ballPos[2] = z;

      if (this.ballMesh) {
        this.ballMesh.position.set(x, y, z);
        // Realistic rolling rotation without heap allocations
        const dz = z - this.prevBallPos[2];
        const dx = x - this.prevBallPos[0];
        this.ballMesh.rotation.x += dz * 3.5;
        this.ballMesh.rotation.z -= dx * 3.5;
      }
    }

    setSkeletonData(data, count) {
      if (data && data.landmarks) {
        this.skeletonData = data;
      } else if (data) {
        if (!this.skeletonData) this.skeletonData = { landmarks: null, count: 0 };
        this.skeletonData.landmarks = data;
        this.skeletonData.count = count || 33;
      }
    }

    updateSkeleton() {
      if (!this.skeletonData || !this.skeletonData.landmarks) {
        if (this.skeletonGroup) this.skeletonGroup.visible = false;
        return;
      }

      const lms = this.skeletonData.landmarks;
      if (!lms || lms.length < 45) { // Need at least 15 joints * 3 floats
        if (this.skeletonGroup) this.skeletonGroup.visible = false;
        return;
      }

      if (this.skeletonGroup) this.skeletonGroup.visible = true;
      const isFlat = typeof lms[0] === 'number';

      // 1. Update 15 key anatomical joint positions
      for (let i = 0; i < this.jointIndices.length; i++) {
        const jointIdx = this.jointIndices[i];
        const jm = (this.jointMeshes && this.jointMeshes[i]) ? this.jointMeshes[i] : null;
        const v = this._jointPositions[jointIdx];

        let x = 0, y = 0, z = 0, valid = false;
        if (isFlat) {
          const base = jointIdx * 3;
          if (base + 2 < lms.length) {
            x = lms[base + 0];
            y = lms[base + 1];
            z = lms[base + 2] || 0.0;
            valid = true;
          }
        } else if (Array.isArray(lms[jointIdx])) {
          x = lms[jointIdx][0];
          y = lms[jointIdx][1];
          z = lms[jointIdx][2] || 0.0;
          valid = true;
        } else if (lms[jointIdx] && typeof lms[jointIdx] === 'object') {
          x = lms[jointIdx].x !== undefined ? lms[jointIdx].x : 0.5;
          y = lms[jointIdx].y !== undefined ? lms[jointIdx].y : 0.5;
          z = lms[jointIdx].z !== undefined ? lms[jointIdx].z : 0.0;
          valid = true;
        }

        if (valid && !isNaN(x) && !isNaN(y)) {
          // World coordinate mapping:
          // x in [0, 1] -> centered at player pos (-1.4 to +1.4)
          // y in [0, 1] -> feet on floor, head at ~1.8m
          // z in [-0.5, 0.5] -> depth around 1.0 to 2.5m
          const wx = (x - 0.5) * -2.8;
          const wy = (1.0 - y) * 2.0;
          const wz = 1.0 + (z || 0.0) * 1.5;
          if (v) v.set(wx, wy, wz);
          if (jm && v) {
            jm.position.copy(v);
            jm.visible = true;
          }
        } else if (jm) {
          jm.visible = false;
        }
      }

      // 2. Update bone lines
      if (this.boneLines && this.boneLines.geometry) {
        const posAttr = this.boneLines.geometry.attributes.position;
        let ptr = 0;
        for (let i = 0; i < this.boneConnections.length; i++) {
          const [a, b] = this.boneConnections[i];
          const va = this._jointPositions[a];
          const vb = this._jointPositions[b];
          if (va && vb) {
            posAttr.setXYZ(ptr++, va.x, va.y, va.z);
            posAttr.setXYZ(ptr++, vb.x, vb.y, vb.z);
          }
        }
        posAttr.needsUpdate = true;
      }

      // Update 3D Avatar Body Parts
      if (this.avatarHead && this._jointPositions[0]) {
        this.avatarHead.position.copy(this._jointPositions[0]);
      }
      if (this.avatarTorso && this._jointPositions[11] && this._jointPositions[12] && this._jointPositions[23] && this._jointPositions[24]) {
        const sX = (this._jointPositions[11].x + this._jointPositions[12].x) * 0.5;
        const sY = (this._jointPositions[11].y + this._jointPositions[12].y) * 0.5;
        const sZ = (this._jointPositions[11].z + this._jointPositions[12].z) * 0.5;
        const hX = (this._jointPositions[23].x + this._jointPositions[24].x) * 0.5;
        const hY = (this._jointPositions[23].y + this._jointPositions[24].y) * 0.5;
        const hZ = (this._jointPositions[23].z + this._jointPositions[24].z) * 0.5;
        this.avatarTorso.position.set((sX + hX) * 0.5, (sY + hY) * 0.5, (sZ + hZ) * 0.5);
        if (this.avatarShorts) {
          this.avatarShorts.position.set(hX, hY - 0.15, hZ);
        }
      }
      if (this.avatarShoeL && this._jointPositions[31]) {
        this.avatarShoeL.position.copy(this._jointPositions[31]);
      }
      if (this.avatarShoeR && this._jointPositions[32]) {
        this.avatarShoeR.position.copy(this._jointPositions[32]);
      }
    }

    render() {
      if (this.controls) this.controls.update();

      // Accurate rolling FPS & frame time measurement with Zero-GC ring buffer
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const deltaMs = now - this.lastFrameTime;
      this.lastFrameTime = now;

      if (deltaMs > 0 && deltaMs < 250) {
        this.frameTimeHistory[this.historyIndex] = deltaMs;
        this.historyIndex = (this.historyIndex + 1) % 30;
        if (this.historyCount < 30) this.historyCount++;

        let sum = 0;
        for (let i = 0; i < this.historyCount; i++) sum += this.frameTimeHistory[i];
        this.frameTimeMs = sum / this.historyCount;
        this.rollingFps = 1000 / Math.max(0.5, this.frameTimeMs);
        this.fps = Math.round(this.rollingFps);
      }

      // Dynamic Resolution Scaling (DRS)
      if (this.drsEnabled && this.renderer) {
        this.drsAdjustmentCooldown++;
        if (this.drsAdjustmentCooldown >= 15) {
          this.drsAdjustmentCooldown = 0;
          // Target 60 FPS budget: 16.66ms. If frame time > 18.0ms (stutter / dropping below 56 FPS):
          if (this.frameTimeMs > 18.0 && this.currentPixelRatio > this.minPixelRatio) {
            const nextRatio = Math.max(this.minPixelRatio, this.currentPixelRatio - 0.1);
            if (Math.abs(nextRatio - this.currentPixelRatio) >= 0.04) {
              this.currentPixelRatio = Math.round(nextRatio * 100) / 100;
              this.renderer.setPixelRatio(this.currentPixelRatio);
            }
          } else if (this.frameTimeMs < 15.5 && this.currentPixelRatio < this.maxPixelRatio) {
            // Frame is well within budget: smoothly restore pixel ratio
            const nextRatio = Math.min(this.maxPixelRatio, this.currentPixelRatio + 0.05);
            if (Math.abs(nextRatio - this.currentPixelRatio) >= 0.04) {
              this.currentPixelRatio = Math.round(nextRatio * 100) / 100;
              this.renderer.setPixelRatio(this.currentPixelRatio);
            }
          }
        }
      }

      this.updateSkeleton();

      // Dynamic pin physics visual in bowling
      if (this.currentSport === 2 && this.bowlingPins) {
        const bz = this.ballPos[2];
        if (bz >= 19.5) {
          // Ball hit the pin deck! Knock pins realistically
          this.bowlingPins.forEach((pin, i) => {
            const angle = (i % 2 === 0 ? 1 : -1) * 0.8;
            if (typeof THREE !== 'undefined' && THREE.MathUtils) {
              pin.rotation.z = THREE.MathUtils.lerp(pin.rotation.z, angle, 0.15);
              pin.position.y = THREE.MathUtils.lerp(pin.position.y, 0.08, 0.15);
            }
          });
        } else {
          // Reset pins upright
          this.bowlingPins.forEach((pin) => {
            if (typeof THREE !== 'undefined' && THREE.MathUtils) {
              pin.rotation.z = THREE.MathUtils.lerp(pin.rotation.z, 0, 0.1);
              pin.position.y = THREE.MathUtils.lerp(pin.position.y, 0, 0.1);
            }
          });
        }
      }

      // Update 3D Goalkeeper in Football
      if (this.currentSport === 1 && this.goalkeeper) {
        const t = now * 0.003;
        const bz = this.ballPos[2];
        const bx = this.ballPos[0];
        if (bz > 3.0 && bz < 25.0) {
          // Ball in flight: goalie dives toward projected ball trajectory!
          const targetX = Math.max(-2.5, Math.min(2.5, bx * 1.1));
          this.goalkeeper.position.x += (targetX - this.goalkeeper.position.x) * 0.14;
          this.goalkeeper.rotation.z = -(this.goalkeeper.position.x * 0.18);
          if (this.gkLeftGlove && this.gkRightGlove) {
            this.gkLeftGlove.position.x = -0.55 + Math.sin(t * 8) * 0.2;
            this.gkRightGlove.position.x = 0.55 + Math.cos(t * 8) * 0.2;
          }
        } else {
          // Idle ready stance: bounce and ready hands
          this.goalkeeper.position.x = Math.sin(t) * 0.5;
          this.goalkeeper.rotation.z = 0;
          this.goalkeeper.position.y = Math.abs(Math.sin(t * 3)) * 0.08;
        }
      }

      // Update 3D Opponent Boxer in Boxing
      if (this.currentSport === 3 && this.opponentBoxer) {
        const t = now * 0.004;
        this.opponentBoxer.position.x = Math.sin(t) * 0.35;
        this.opponentBoxer.position.y = Math.abs(Math.sin(t * 2)) * 0.06;
        if (this.oppGloveL && this.oppGloveR) {
          // Bobbing guard and throwing jabs
          this.oppGloveL.position.z = -0.4 + Math.sin(t * 3) * 0.35;
          this.oppGloveR.position.z = -0.4 + Math.cos(t * 2.5) * 0.25;
        }
      }

      // Update 3D Table Tennis Opponent
      if (this.currentSport === 5 && this.ttOpponent) {
        const targetX = Math.max(-1.1, Math.min(1.1, this.ballPos[0]));
        this.ttOpponent.position.x += (targetX - this.ttOpponent.position.x) * 0.12;
        if (this.ttPaddle) {
          this.ttPaddle.rotation.y = Math.sin(now * 0.005) * 0.4;
        }
      }

      // Update Confetti celebration particles
      if (this.confettiActive && this.confettiParticles) {
        this.confettiTimer -= 0.016;
        if (this.confettiTimer <= 0) {
          this.confettiActive = false;
          this.confettiParticles.material.opacity = 0;
        } else {
          const pos = this.confettiParticles.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            let y = pos.getY(i) - 0.08;
            if (y < 0.2) y = 10.0;
            pos.setY(i, y);
          }
          pos.needsUpdate = true;
          this.confettiParticles.rotation.y += 0.01;
        }
      }

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
        if (this.renderer.info && this.renderer.info.render) {
          this.drawCallCount = this.renderer.info.render.calls;
        }
      }
    }

    resize() {
      if (!this.canvas || !this.renderer || !this.camera) return;
      const w = this.canvas.clientWidth || 800;
      const h = this.canvas.clientHeight || 450;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    }
  }

  // Export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RealisticKinectRenderer };
  }
  if (typeof window !== 'undefined') {
    window.RealisticKinectRenderer = RealisticKinectRenderer;
  }
  if (typeof global !== 'undefined') {
    global.RealisticKinectRenderer = RealisticKinectRenderer;
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

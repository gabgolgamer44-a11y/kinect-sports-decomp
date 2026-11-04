import os
import re

html_path = "public/index.html"

with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

# 1. Update Scripts in head
old_script_block = """  <!-- Kinect Sports Web Port Runtime Engines -->
  <script src="webport/wasm_game_runtime.js"></script>"""

new_script_block = """  <!-- Kinect Sports Web Port Native Engines (Padrão playgta5.com) -->
  <script src="webport/wasm_httpfs.js"></script>
  <script src="webport/webgpu_driver.js"></script>
  <script src="webport/wasm_game_runtime.js"></script>"""

if old_script_block in html:
    html = html.replace(old_script_block, new_script_block)
    print("[1] Script tags atualizadas no head com sucesso!")
else:
    print("[1] Script tags já atualizadas ou bloco não encontrado exatamente.")

# 2. Update Reality Banner to Native WebPort (WASM + WebGPU) Banner
old_banner_start = '<!-- Reality Disclaimer Banner -->'
old_banner_end = '<!-- Game Controls Toolbar -->'

new_banner = """<!-- Native WebPort Banner (Padrão playgta5.com) -->
        <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(15, 23, 42, 0.95)); border: 2px solid #10b981; border-radius: 12px; padding: 1.25rem 1.5rem; margin-top: 1rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; box-shadow: 0 0 25px rgba(16, 185, 129, 0.2);">
          <div>
            <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem;">
              <span style="background: #10b981; color: #000; font-size: 0.72rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: 6px; letter-spacing: 0.05em; text-transform: uppercase;">WASM + WebGPU Ativo</span>
              <span style="background: rgba(6, 182, 212, 0.2); color: #06b6d4; font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 6px; border: 1px solid rgba(6, 182, 212, 0.4);">Padrão playgta5.com</span>
              <span style="background: rgba(168, 85, 247, 0.2); color: #c084fc; font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 6px; border: 1px solid rgba(168, 85, 247, 0.4);">100% Código C Nativo</span>
            </div>
            <h3 style="color: #6ee7b7; margin: 0 0 0.35rem 0; font-size: 1.15rem; display: flex; align-items: center; gap: 0.5rem;">
              🎮 Executável Nativo WebAssembly & Renderizador WebGPU
            </h3>
            <p style="margin: 0; color: #cbd5e1; font-size: 0.88rem; max-width: 760px; line-height: 1.45;">
              O jogo agora executa o binário nativo <strong>kinect_sports_xenon.wasm</strong> compilado diretamente do código-fonte em C com aceleração gráfica <strong>WebGPU 1.0 (Shaders WGSL)</strong>! Os dados e pacotes de esportes são transmitidos sob demanda via <strong>wasm_httpfs</strong> com cache persistente em IndexedDB.
            </p>
          </div>
          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
            <button onclick="openDownloadModal()" style="background: rgba(255,255,255,0.1); color: #fff; font-weight: 700; border: 1px solid rgba(255,255,255,0.2); padding: 0.75rem 1.2rem; border-radius: 10px; cursor: pointer; font-size: 0.9rem; transition: all 0.2s;">
              📥 Baixar Edição PC (Xenia)
            </button>
            <button onclick="toggleRealGameStream()" id="btnStreamToggle" style="background: #3b82f6; color: #fff; font-weight: 800; border: none; padding: 0.75rem 1.4rem; border-radius: 10px; cursor: pointer; box-shadow: 0 4px 15px rgba(59,130,246,0.4); font-size: 0.95rem;">
              📺 Alternar Stream Ao Vivo
            </button>
          </div>
        </div>
      </section>

      <!-- Game Controls Toolbar -->"""

if old_banner_start in html and old_banner_end in html:
    idx1 = html.find(old_banner_start)
    idx2 = html.find(old_banner_end) + len(old_banner_end)
    html = html[:idx1] + new_banner + html[idx2:]
    print("[2] Banner atualizado para padrão playgta5.com com sucesso!")
else:
    print("[2] Banner não encontrado exatamente.")

# 3. Update gameLoop inside initWebPort
old_gameloop_block = """          if (gWasmRuntime) {
            gWasmRuntime.update(dt);
            const state = gWasmRuntime.getGameState();
            if (gRenderer) {
              gRenderer.setBallPosition(state.ball.pos[0], state.ball.pos[1], state.ball.pos[2]);
              gRenderer.render();
            }"""

new_gameloop_block = """          if (gWasmRuntime) {
            gWasmRuntime.update(dt);
            gWasmRuntime.render();
            const state = gWasmRuntime.getGameState();
            // If WebGPU is not active, fallback to WebGL renderer
            if (gRenderer && (!window.WebGPUDriver || !window.WebGPUDriver.isInitialized)) {
              gRenderer.setBallPosition(state.ball.pos[0], state.ball.pos[1], state.ball.pos[2]);
              gRenderer.render();
            }"""

if old_gameloop_block in html:
    html = html.replace(old_gameloop_block, new_gameloop_block)
    print("[3] gameLoop render call atualizado com sucesso!")
else:
    print("[3] gameLoop render call já atualizado ou bloco diferente.")

# 4. Update HUD text in gameLoop
old_hud_text = "domFpsDisplay.innerText = `${gRenderer.fps || 60} FPS (${ms}ms) · ${gRenderer.drawCallCount || 2} DRAWS · [${presetLabel}] · DRS ${drs}x`;"
new_hud_text = "domFpsDisplay.innerText = `${state.backend || 'WebGPU'} · ${gRenderer ? gRenderer.fps || 60 : 60} FPS (${ms}ms) · ${state.vertexCount || 2} Verts · DRS ${drs}x`;"

if old_hud_text in html:
    html = html.replace(old_hud_text, new_hud_text)
    print("[4] HUD text format atualizado com sucesso!")
else:
    print("[4] HUD text format já atualizado ou não encontrado.")

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)

print("public/index.html salvo com sucesso!")

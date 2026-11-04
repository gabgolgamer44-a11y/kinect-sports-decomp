/**
 * Kinect Sports WebAssembly Master Entrypoint & Native Game Runtime
 * Title ID: 4D5308C9 - Xbox 360 Decompilation Web Port (Padrão playgta5.com)
 */

#include "xenon_types.h"
#include "xenon_memory.h"
#include "xenon_vfs.h"
#include "kinect_nui.h"
#include "xenos_d3d9.h"
#include "freestanding_libc.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define KS_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define KS_EXPORT __attribute__((visibility("default")))
#endif

typedef struct {
    uint32_t sport_id;
    uint32_t score_player;
    uint32_t score_opponent;
    uint32_t game_time_seconds;
    uint32_t state_flags;
    float    ball_pos[3];
    float    ball_velocity[3];
    float    player_pos[3];
    uint32_t active_gestures;
    uint32_t frame_count;
} KS_GAME_STATE;

static KS_GAME_STATE g_GameState;
static bool          g_Running = false;

/* Decompiled functions from Xbox 360 binary (src/auto_match/) */
extern int fn_82B53520(int a1, int a2, int a3);
extern void fn_82B53448(int a1, int a2, int a3, int a4);
extern int fn_82B53638(void *ctx, float power, float angle);
extern int fn_82B52FF8(int a, int b, int c, int d, int e);

/* Weak fallbacks for symbols if resolving dynamically */
int __attribute__((weak)) fn_82B53520(int a1, int a2, int a3) {
    (void)a1; (void)a2; (void)a3;
    return 1;
}

void __attribute__((weak)) fn_82B53448(int a1, int a2, int a3, int a4) {
    (void)a1; (void)a2; (void)a3; (void)a4;
}

int __attribute__((weak)) fn_82B53638(void *ctx, float power, float angle) {
    (void)ctx; (void)power; (void)angle;
    return 1;
}

int __attribute__((weak)) fn_82B52FF8(int a, int b, int c, int d, int e) {
    (void)a; (void)b; (void)c; (void)d; (void)e;
    return 1;
}

KS_EXPORT int ks_init(uint32_t flags) {
    (void)flags;
    XenonMemoryInit(32 * 1024 * 1024);
    XenonVFS_Init();
    NuiInitialize(0);
    XenosInitRenderer(1280, 720);

    memset(&g_GameState, 0, sizeof(g_GameState));
    g_GameState.sport_id = KS_SPORT_FOOTBALL;
    g_GameState.ball_pos[1] = 0.22f; /* ground level */
    g_GameState.ball_pos[2] = 2.0f;
    g_Running = true;
    return 0;
}

KS_EXPORT void ks_shutdown(void) {
    g_Running = false;
    NuiShutdown();
    XenonMemoryShutdown();
}

KS_EXPORT int ks_select_sport(uint32_t sport_id) {
    if (sport_id > KS_SPORT_MAINMENU) {
        return -1;
    }
    g_GameState.sport_id = sport_id;
    g_GameState.score_player = 0;
    g_GameState.score_opponent = 0;
    g_GameState.game_time_seconds = 0;
    g_GameState.ball_pos[0] = 0.0f;
    g_GameState.ball_pos[1] = 0.22f;
    g_GameState.ball_pos[2] = 2.0f;
    g_GameState.ball_velocity[0] = 0.0f;
    g_GameState.ball_velocity[1] = 0.0f;
    g_GameState.ball_velocity[2] = 0.0f;

    /* If bowling, place ball in bowler hand */
    if (sport_id == KS_SPORT_BOWLING) {
        g_GameState.ball_pos[1] = 0.8f;
        g_GameState.ball_pos[2] = 1.0f;
    } else if (sport_id == KS_SPORT_TABLETENNIS) {
        g_GameState.ball_pos[1] = 0.82f;
        g_GameState.ball_pos[2] = 3.0f;
    } else if (sport_id == KS_SPORT_VOLLEYBALL) {
        g_GameState.ball_pos[1] = 1.5f;
        g_GameState.ball_pos[2] = 3.0f;
    }

    return 0;
}

KS_EXPORT int ks_feed_kinect_skeleton(const float *landmarks, int count, float confidence) {
    return NuiSetWebcamSkeleton(landmarks, count, confidence);
}

KS_EXPORT int ks_trigger_gesture(uint32_t gesture_type, float velocity, float confidence) {
    NUI_GESTURE_EVENT ev;
    ev.sport_id = g_GameState.sport_id;
    ev.gesture_type = gesture_type;
    ev.velocity = velocity;
    ev.confidence = confidence;
    ev.timestamp_ms = g_GameState.frame_count * 16;
    ev.direction_x = 0.0f;
    ev.direction_y = 0.0f;
    ev.direction_z = 1.0f;
    NuiDispatchGestureEvent(&ev);

    /* Process sport-specific reactions */
    if (g_GameState.sport_id == KS_SPORT_FOOTBALL) {
        if (gesture_type == 1) { /* Kick */
            fn_82B53638((void*)0, velocity, 0.0f);
            g_GameState.ball_velocity[0] = (ev.direction_x) * 5.0f;
            g_GameState.ball_velocity[1] = velocity * 4.5f;
            g_GameState.ball_velocity[2] = velocity * 16.0f;
            g_GameState.active_gestures |= (1 << 0);
        }
    } else if (g_GameState.sport_id == KS_SPORT_BOWLING) {
        if (gesture_type == 2) { /* Bowling swing */
            g_GameState.ball_velocity[2] = velocity * 13.0f;
            g_GameState.ball_velocity[1] = -1.0f;
            g_GameState.active_gestures |= (1 << 1);
        }
    } else if (g_GameState.sport_id == KS_SPORT_BOXING) {
        if (gesture_type == 3 || gesture_type == 4) { /* Punch Left / Right */
            g_GameState.active_gestures |= (1 << (gesture_type - 1));
            if (velocity > 1.2f) {
                g_GameState.score_player += 10;
            }
        }
    } else if (g_GameState.sport_id == KS_SPORT_VOLLEYBALL) {
        if (gesture_type == 6) { /* Spike */
            g_GameState.ball_velocity[1] = 9.0f;
            g_GameState.ball_velocity[2] = 11.0f;
        }
    } else if (g_GameState.sport_id == KS_SPORT_TABLETENNIS) {
        if (gesture_type == 7 || gesture_type == 8) { /* Forehand / Backhand */
            g_GameState.ball_velocity[2] = 12.0f;
            g_GameState.ball_velocity[1] = 2.0f;
        }
    } else if (g_GameState.sport_id == KS_SPORT_TRACKANDFIELD) {
        if (gesture_type == 5) { /* Jump */
            g_GameState.player_pos[1] = velocity * 0.9f;
        }
    }

    return 0;
}

KS_EXPORT int ks_inject_controller(uint32_t buttons, float stick_x, float stick_y) {
    (void)stick_y;
    g_GameState.player_pos[0] += stick_x * 0.05f;
    
    if (buttons & 0x01) { /* Button A / Space: Action / Kick / Swing */
        if (g_GameState.sport_id == KS_SPORT_FOOTBALL) {
            ks_trigger_gesture(1, 1.8f, 1.0f);
        } else if (g_GameState.sport_id == KS_SPORT_BOWLING) {
            ks_trigger_gesture(2, 1.6f, 1.0f);
        } else if (g_GameState.sport_id == KS_SPORT_BOXING) {
            ks_trigger_gesture(3, 1.5f, 1.0f);
        } else if (g_GameState.sport_id == KS_SPORT_VOLLEYBALL) {
            ks_trigger_gesture(6, 1.6f, 1.0f);
        } else if (g_GameState.sport_id == KS_SPORT_TABLETENNIS) {
            ks_trigger_gesture(7, 1.7f, 1.0f);
        }
    }
    if (buttons & 0x02) { /* Button B / Shift: Jump / Secondary */
        ks_trigger_gesture(5, 1.4f, 1.0f);
    }
    return 0;
}

KS_EXPORT void ks_update(float delta_time) {
    if (!g_Running) return;
    g_GameState.frame_count++;
    
    /* Ball Physics Integration */
    if (fabsf(g_GameState.ball_velocity[2]) > 0.01f || fabsf(g_GameState.ball_velocity[1]) > 0.01f || fabsf(g_GameState.ball_velocity[0]) > 0.01f) {
        g_GameState.ball_pos[0] += g_GameState.ball_velocity[0] * delta_time;
        g_GameState.ball_pos[1] += g_GameState.ball_velocity[1] * delta_time;
        g_GameState.ball_pos[2] += g_GameState.ball_velocity[2] * delta_time;
        
        /* Gravity */
        g_GameState.ball_velocity[1] -= 9.81f * delta_time;
        
        /* Sport specific floor collision & rules */
        if (g_GameState.sport_id == KS_SPORT_FOOTBALL) {
            if (g_GameState.ball_pos[1] <= 0.22f) {
                g_GameState.ball_pos[1] = 0.22f;
                g_GameState.ball_velocity[1] = -g_GameState.ball_velocity[1] * 0.65f; /* bounce */
                g_GameState.ball_velocity[2] *= 0.96f; /* turf friction */
            }

            /* Check Goal */
            if (g_GameState.ball_pos[2] >= 24.5f) {
                if (fabsf(g_GameState.ball_pos[0]) <= 3.66f && g_GameState.ball_pos[1] <= 2.44f) {
                    /* GOAL! */
                    g_GameState.score_player++;
                    fn_82B53520(0, 0x53, 1);
                    fn_82B53448(0, 0, 1, 1);
                    fn_82B52FF8(0, 1, g_GameState.score_player, g_GameState.score_opponent, 1);
                    
                    /* Reset */
                    g_GameState.ball_pos[0] = 0.0f;
                    g_GameState.ball_pos[1] = 0.22f;
                    g_GameState.ball_pos[2] = 2.0f;
                    g_GameState.ball_velocity[0] = 0.0f;
                    g_GameState.ball_velocity[1] = 0.0f;
                    g_GameState.ball_velocity[2] = 0.0f;
                } else {
                    /* Out of bounds */
                    g_GameState.ball_pos[2] = 2.0f;
                    g_GameState.ball_velocity[2] = 0.0f;
                }
            }
        }
        else if (g_GameState.sport_id == KS_SPORT_BOWLING) {
            if (g_GameState.ball_pos[1] <= 0.18f) {
                g_GameState.ball_pos[1] = 0.18f;
                g_GameState.ball_velocity[1] = 0.0f;
            }
            if (g_GameState.ball_pos[2] >= 18.0f) {
                /* Strike / Pin hit */
                g_GameState.score_player += 10;
                g_GameState.ball_pos[0] = 0.0f;
                g_GameState.ball_pos[1] = 0.8f;
                g_GameState.ball_pos[2] = 1.0f;
                g_GameState.ball_velocity[2] = 0.0f;
            }
        }
        else if (g_GameState.sport_id == KS_SPORT_VOLLEYBALL) {
            if (g_GameState.ball_pos[1] <= 0.21f) {
                g_GameState.ball_pos[1] = 0.21f;
                g_GameState.ball_velocity[1] = -g_GameState.ball_velocity[1] * 0.7f;
            }
            if (g_GameState.ball_pos[2] >= 12.0f) {
                g_GameState.score_player += 1;
                g_GameState.ball_pos[1] = 1.5f;
                g_GameState.ball_pos[2] = 3.0f;
                g_GameState.ball_velocity[2] = 0.0f;
            }
        }
        else if (g_GameState.sport_id == KS_SPORT_TABLETENNIS) {
            if (g_GameState.ball_pos[1] <= 0.78f && g_GameState.ball_pos[2] >= 2.0f && g_GameState.ball_pos[2] <= 6.0f) {
                g_GameState.ball_pos[1] = 0.78f;
                g_GameState.ball_velocity[1] = -g_GameState.ball_velocity[1] * 0.85f;
            }
            if (g_GameState.ball_pos[2] >= 6.0f) {
                g_GameState.score_player += 1;
                g_GameState.ball_pos[1] = 0.82f;
                g_GameState.ball_pos[2] = 3.0f;
                g_GameState.ball_velocity[2] = 0.0f;
            }
        }
    }
}

KS_EXPORT void ks_render(void) {
    if (!g_Running) return;
    XenosBeginFrame();
    
    /* Build real 3D geometry vertices for WebGPU */
    XenosBuildSportMesh(
        g_GameState.sport_id,
        g_GameState.ball_pos[0],
        g_GameState.ball_pos[1],
        g_GameState.ball_pos[2],
        NuiGetTrackedSkeleton()
    );
    
    XenosEndFrame();
}

/* Data Accessors for WebGPU & Web JS Driver */
KS_EXPORT const KS_GAME_STATE* ks_get_state_ptr(void) {
    return &g_GameState;
}

KS_EXPORT const D3D9_VERTEX* ks_get_vertex_buffer_ptr(void) {
    return XenosGetVertexBuffer();
}

KS_EXPORT uint32_t ks_get_vertex_count(void) {
    return XenosGetVertexCount();
}

KS_EXPORT uint32_t ks_get_score_player(void) {
    return g_GameState.score_player;
}

KS_EXPORT uint32_t ks_get_score_opponent(void) {
    return g_GameState.score_opponent;
}

KS_EXPORT float ks_get_ball_z(void) {
    return g_GameState.ball_pos[2];
}

KS_EXPORT void* ks_get_raw_memory_ptr(void) {
    return XenonGetRawPoolPtr();
}

KS_EXPORT uint32_t ks_get_raw_memory_size(void) {
    return XenonGetPoolSize();
}

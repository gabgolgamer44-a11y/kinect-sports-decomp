/**
 * Xbox 360 Xenos Graphics Direct3D 9 WebGPU Bridge Implementation
 * Kinect Sports (Title ID: 4D5308C9) - Web Port
 */

#include "xenos_d3d9.h"
#include "freestanding_libc.h"

#define MAX_DRAW_COMMANDS   512
#define MAX_VERTICES        32768

static XENOS_DRAW_COMMAND g_CommandBuffer[MAX_DRAW_COMMANDS];
static uint32_t           g_CommandCount = 0;
static uint32_t           g_TotalDrawCalls = 0;

static D3D9_VERTEX        g_VertexBuffer[MAX_VERTICES];
static uint32_t           g_VertexCount = 0;

static float              g_CurrentWorldMatrix[16];
static float              g_CurrentViewProjMatrix[16];
static uint32_t           g_CurrentTexture = 0;

int XenosInitRenderer(uint32_t width, uint32_t height) {
    (void)width;
    (void)height;
    g_CommandCount = 0;
    g_TotalDrawCalls = 0;
    g_VertexCount = 0;

    memset(g_CurrentWorldMatrix, 0, sizeof(g_CurrentWorldMatrix));
    memset(g_CurrentViewProjMatrix, 0, sizeof(g_CurrentViewProjMatrix));
    for (int i = 0; i < 4; i++) {
        g_CurrentWorldMatrix[i * 5] = 1.0f;
        g_CurrentViewProjMatrix[i * 5] = 1.0f;
    }
    return 0;
}

void XenosBeginFrame(void) {
    g_CommandCount = 0;
    g_VertexCount = 0;
}

void XenosEndFrame(void) {
    g_TotalDrawCalls += g_CommandCount;
}

void XenosResetVertexBuffer(void) {
    g_VertexCount = 0;
}

void XenosPushVertex(float x, float y, float z, float nx, float ny, float nz, float u, float v, float r, float g, float b, float a) {
    if (g_VertexCount >= MAX_VERTICES) return;
    D3D9_VERTEX *vert = &g_VertexBuffer[g_VertexCount++];
    vert->x = x;   vert->y = y;   vert->z = z;
    vert->nx = nx; vert->ny = ny; vert->nz = nz;
    vert->u = u;   vert->v = v;
    vert->r = r;   vert->g = g;   vert->b = b;   vert->a = a;
}

/* Helper to push a textured quad (2 triangles, 6 vertices) */
static void PushQuad(
    float x0, float y0, float z0,
    float x1, float y1, float z1,
    float x2, float y2, float z2,
    float x3, float y3, float z3,
    float nx, float ny, float nz,
    float r, float g, float b, float a
) {
    XenosPushVertex(x0, y0, z0, nx, ny, nz, 0.0f, 0.0f, r, g, b, a);
    XenosPushVertex(x1, y1, z1, nx, ny, nz, 1.0f, 0.0f, r, g, b, a);
    XenosPushVertex(x2, y2, z2, nx, ny, nz, 1.0f, 1.0f, r, g, b, a);

    XenosPushVertex(x0, y0, z0, nx, ny, nz, 0.0f, 0.0f, r, g, b, a);
    XenosPushVertex(x2, y2, z2, nx, ny, nz, 1.0f, 1.0f, r, g, b, a);
    XenosPushVertex(x3, y3, z3, nx, ny, nz, 0.0f, 1.0f, r, g, b, a);
}

/* Helper to push an oriented 3D Box (12 triangles, 36 vertices) */
static void PushBox(float cx, float cy, float cz, float hx, float hy, float hz, float r, float g, float b, float a) {
    /* Front (+Z) */
    PushQuad(cx - hx, cy - hy, cz + hz, cx + hx, cy - hy, cz + hz, cx + hx, cy + hy, cz + hz, cx - hx, cy + hy, cz + hz, 0, 0, 1, r, g, b, a);
    /* Back (-Z) */
    PushQuad(cx + hx, cy - hy, cz - hz, cx - hx, cy - hy, cz - hz, cx - hx, cy + hy, cz - hz, cx + hx, cy + hy, cz - hz, 0, 0, -1, r * 0.8f, g * 0.8f, b * 0.8f, a);
    /* Top (+Y) */
    PushQuad(cx - hx, cy + hy, cz + hz, cx + hx, cy + hy, cz + hz, cx + hx, cy + hy, cz - hz, cx - hx, cy + hy, cz - hz, 0, 1, 0, r * 1.1f, g * 1.1f, b * 1.1f, a);
    /* Bottom (-Y) */
    PushQuad(cx - hx, cy - hy, cz - hz, cx + hx, cy - hy, cz - hz, cx + hx, cy - hy, cz + hz, cx - hx, cy - hy, cz + hz, 0, -1, 0, r * 0.6f, g * 0.6f, b * 0.6f, a);
    /* Right (+X) */
    PushQuad(cx + hx, cy - hy, cz + hz, cx + hx, cy - hy, cz - hz, cx + hx, cy + hy, cz - hz, cx + hx, cy + hy, cz + hz, 1, 0, 0, r * 0.9f, g * 0.9f, b * 0.9f, a);
    /* Left (-X) */
    PushQuad(cx - hx, cy - hy, cz - hz, cx - hx, cy - hy, cz + hz, cx - hx, cy + hy, cz + hz, cx - hx, cy + hy, cz - hz, -1, 0, 0, r * 0.7f, g * 0.7f, b * 0.7f, a);
}

/* Helper to push a 3D Sphere (approx 6 rings x 8 segments = 96 triangles) */
static void PushSphere(float cx, float cy, float cz, float radius, float r, float g, float b, float a) {
    const int rings = 6;
    const int sectors = 8;
    const float PI = 3.14159265f;

    for (int i = 0; i < rings; i++) {
        float phi1 = PI * ((float)i / (float)rings);
        float phi2 = PI * ((float)(i + 1) / (float)rings);
        float y1 = radius * cosf(phi1);
        float y2 = radius * cosf(phi2);
        float r1 = radius * sinf(phi1);
        float r2 = radius * sinf(phi2);

        for (int j = 0; j < sectors; j++) {
            float theta1 = 2.0f * PI * ((float)j / (float)sectors);
            float theta2 = 2.0f * PI * ((float)(j + 1) / (float)sectors);

            float x11 = r1 * cosf(theta1), z11 = r1 * sinf(theta1);
            float x12 = r1 * cosf(theta2), z12 = r1 * sinf(theta2);
            float x21 = r2 * cosf(theta1), z21 = r2 * sinf(theta1);
            float x22 = r2 * cosf(theta2), z22 = r2 * sinf(theta2);

            /* Triangle 1 */
            XenosPushVertex(cx + x11, cy + y1, cz + z11, x11 / radius, y1 / radius, z11 / radius, 0, 0, r, g, b, a);
            XenosPushVertex(cx + x21, cy + y2, cz + z21, x21 / radius, y2 / radius, z21 / radius, 0, 1, r, g, b, a);
            XenosPushVertex(cx + x12, cy + y1, cz + z12, x12 / radius, y1 / radius, z12 / radius, 1, 0, r, g, b, a);

            /* Triangle 2 */
            XenosPushVertex(cx + x12, cy + y1, cz + z12, x12 / radius, y1 / radius, z12 / radius, 1, 0, r, g, b, a);
            XenosPushVertex(cx + x21, cy + y2, cz + z21, x21 / radius, y2 / radius, z21 / radius, 0, 1, r, g, b, a);
            XenosPushVertex(cx + x22, cy + y2, cz + z22, x22 / radius, y2 / radius, z22 / radius, 1, 1, r, g, b, a);
        }
    }
}

/* Helper to push a Bone Segment (cylinder-like prism connecting two 3D points) */
static void PushBone(const Vector4 *p1, const Vector4 *p2, float thickness, float r, float g, float b, float a) {
    if (!p1 || !p2) return;
    float dx = p2->x - p1->x;
    float dy = p2->y - p1->y;
    float dz = p2->z - p1->z;
    float len = sqrtf(dx*dx + dy*dy + dz*dz);
    if (len < 0.001f) return;

    /* Push joint spheres at both ends */
    PushSphere(p1->x, p1->y, p1->z, thickness * 1.6f, r * 1.2f, g * 1.2f, b * 1.2f, a);
    PushSphere(p2->x, p2->y, p2->z, thickness * 1.6f, r * 1.2f, g * 1.2f, b * 1.2f, a);

    /* Push connecting shaft */
    float mx = (p1->x + p2->x) * 0.5f;
    float my = (p1->y + p2->y) * 0.5f;
    float mz = (p1->z + p2->z) * 0.5f;
    PushBox(mx, my, mz, thickness, len * 0.48f, thickness, r, g, b, a);
}

void XenosBuildSportMesh(uint32_t sport_id, float ball_x, float ball_y, float ball_z, const NUI_SKELETON_DATA *skeleton) {
    XenosResetVertexBuffer();

    /* 1. Sport Environment & Field */
    if (sport_id == KS_SPORT_FOOTBALL) {
        /* Football Pitch (green grass) */
        PushQuad(-25.0f, 0.0f, 35.0f, 25.0f, 0.0f, 35.0f, 25.0f, 0.0f, -5.0f, -25.0f, 0.0f, -5.0f, 0, 1, 0, 0.15f, 0.65f, 0.22f, 1.0f);
        /* Penalty Box white lines */
        PushQuad(-10.0f, 0.01f, 28.0f, 10.0f, 0.01f, 28.0f, 10.0f, 0.01f, 18.0f, -10.0f, 0.01f, 18.0f, 0, 1, 0, 0.95f, 0.95f, 0.95f, 0.9f);
        /* Goal posts (White bars) */
        PushBox(-3.66f, 1.22f, 25.0f, 0.08f, 1.22f, 0.08f, 0.95f, 0.95f, 0.95f, 1.0f); /* Left Post */
        PushBox(3.66f, 1.22f, 25.0f, 0.08f, 1.22f, 0.08f, 0.95f, 0.95f, 0.95f, 1.0f);  /* Right Post */
        PushBox(0.0f, 2.44f, 25.0f, 3.74f, 0.08f, 0.08f, 0.95f, 0.95f, 0.95f, 1.0f);   /* Crossbar */
        /* Goal Net (translucent) */
        PushQuad(-3.66f, 0.0f, 27.0f, 3.66f, 0.0f, 27.0f, 3.66f, 2.44f, 25.0f, -3.66f, 2.44f, 25.0f, 0, 0, -1, 0.8f, 0.8f, 0.8f, 0.4f);
        /* 3D Soccer Ball */
        PushSphere(ball_x, ball_y, ball_z, 0.22f, 0.95f, 0.95f, 0.95f, 1.0f);
    }
    else if (sport_id == KS_SPORT_BOWLING) {
        /* Maple hardwood lane */
        PushQuad(-1.5f, 0.0f, 22.0f, 1.5f, 0.0f, 22.0f, 1.5f, 0.0f, 0.0f, -1.5f, 0.0f, 0.0f, 0, 1, 0, 0.85f, 0.65f, 0.35f, 1.0f);
        /* Left & Right Gutters (Dark slate) */
        PushQuad(-2.1f, -0.05f, 22.0f, -1.5f, -0.05f, 22.0f, -1.5f, -0.05f, 0.0f, -2.1f, -0.05f, 0.0f, 0, 1, 0, 0.2f, 0.2f, 0.25f, 1.0f);
        PushQuad(1.5f, -0.05f, 22.0f, 2.1f, -0.05f, 22.0f, 2.1f, -0.05f, 0.0f, 1.5f, -0.05f, 0.0f, 0, 1, 0, 0.2f, 0.2f, 0.25f, 1.0f);
        /* 10 Bowling Pins at end of lane */
        for (int row = 0; row < 4; row++) {
            for (int col = 0; col <= row; col++) {
                float px = (col - row * 0.5f) * 0.35f;
                float pz = 18.0f + row * 0.4f;
                PushBox(px, 0.25f, pz, 0.06f, 0.25f, 0.06f, 0.95f, 0.95f, 0.95f, 1.0f);
            }
        }
        /* 3D Bowling Ball */
        PushSphere(ball_x, ball_y, ball_z, 0.18f, 0.15f, 0.35f, 0.85f, 1.0f);
    }
    else if (sport_id == KS_SPORT_BOXING) {
        /* Boxing Ring Canvas */
        PushQuad(-4.0f, 0.8f, 6.0f, 4.0f, 0.8f, 6.0f, 4.0f, 0.8f, -2.0f, -4.0f, 0.8f, -2.0f, 0, 1, 0, 0.25f, 0.45f, 0.75f, 1.0f);
        /* Ring posts */
        PushBox(-4.0f, 1.8f, 6.0f, 0.12f, 1.0f, 0.12f, 0.9f, 0.1f, 0.1f, 1.0f);  /* Red Corner */
        PushBox(4.0f, 1.8f, -2.0f, 0.12f, 1.0f, 0.12f, 0.1f, 0.2f, 0.9f, 1.0f);  /* Blue Corner */
        PushBox(4.0f, 1.8f, 6.0f, 0.12f, 1.0f, 0.12f, 0.9f, 0.9f, 0.9f, 1.0f);   /* Neutral Corner */
        PushBox(-4.0f, 1.8f, -2.0f, 0.12f, 1.0f, 0.12f, 0.9f, 0.9f, 0.9f, 1.0f);  /* Neutral Corner */
        /* Boxing opponent avatar placeholder */
        PushSphere(0.0f, 1.7f, 3.0f, 0.25f, 0.85f, 0.65f, 0.5f, 1.0f); /* Head */
        PushBox(0.0f, 1.2f, 3.0f, 0.3f, 0.4f, 0.2f, 0.1f, 0.1f, 0.1f, 1.0f); /* Torso */
        PushSphere(-0.4f, 1.3f, 2.5f, 0.15f, 0.9f, 0.15f, 0.15f, 1.0f); /* Left Glove */
        PushSphere(0.4f, 1.3f, 2.5f, 0.15f, 0.9f, 0.15f, 0.15f, 1.0f);  /* Right Glove */
    }
    else if (sport_id == KS_SPORT_VOLLEYBALL) {
        /* Sandy beach court */
        PushQuad(-8.0f, 0.0f, 16.0f, 8.0f, 0.0f, 16.0f, 8.0f, 0.0f, -4.0f, -8.0f, 0.0f, -4.0f, 0, 1, 0, 0.92f, 0.82f, 0.58f, 1.0f);
        /* High Net */
        PushQuad(-5.0f, 0.5f, 6.0f, 5.0f, 0.5f, 6.0f, 5.0f, 2.4f, 6.0f, -5.0f, 2.4f, 6.0f, 0, 0, 1, 0.95f, 0.95f, 0.95f, 0.7f);
        /* Net posts */
        PushBox(-5.1f, 1.3f, 6.0f, 0.08f, 1.3f, 0.08f, 0.8f, 0.2f, 0.1f, 1.0f);
        PushBox(5.1f, 1.3f, 6.0f, 0.08f, 1.3f, 0.08f, 0.8f, 0.2f, 0.1f, 1.0f);
        /* Volleyball */
        PushSphere(ball_x, ball_y, ball_z, 0.21f, 0.95f, 0.85f, 0.15f, 1.0f);
    }
    else if (sport_id == KS_SPORT_TABLETENNIS) {
        /* Wooden Floor */
        PushQuad(-10.0f, 0.0f, 12.0f, 10.0f, 0.0f, 12.0f, 10.0f, 0.0f, -4.0f, -10.0f, 0.0f, -4.0f, 0, 1, 0, 0.45f, 0.35f, 0.25f, 1.0f);
        /* Blue Table Tennis Table */
        PushBox(0.0f, 0.76f, 4.0f, 0.76f, 0.03f, 1.37f, 0.1f, 0.35f, 0.75f, 1.0f);
        /* Table White Border */
        PushBox(0.0f, 0.795f, 4.0f, 0.76f, 0.005f, 0.01f, 0.95f, 0.95f, 0.95f, 1.0f);
        /* Net */
        PushQuad(-0.85f, 0.79f, 4.0f, 0.85f, 0.79f, 4.0f, 0.85f, 0.94f, 4.0f, -0.85f, 0.94f, 4.0f, 0, 0, 1, 0.9f, 0.9f, 0.9f, 0.7f);
        /* Table Tennis Ball */
        PushSphere(ball_x, ball_y, ball_z, 0.04f, 1.0f, 0.55f, 0.1f, 1.0f);
    }
    else { /* Track & Field / Main Menu */
        /* Red Athletic Track */
        PushQuad(-12.0f, 0.0f, 40.0f, 12.0f, 0.0f, 40.0f, 12.0f, 0.0f, -5.0f, -12.0f, 0.0f, -5.0f, 0, 1, 0, 0.82f, 0.25f, 0.2f, 1.0f);
        /* White lane lines */
        for (int l = -3; l <= 3; l++) {
            PushQuad(l * 1.5f - 0.03f, 0.01f, 40.0f, l * 1.5f + 0.03f, 0.01f, 40.0f, l * 1.5f + 0.03f, 0.01f, -5.0f, l * 1.5f - 0.03f, 0.01f, -5.0f, 0, 1, 0, 0.95f, 0.95f, 0.95f, 0.9f);
        }
        /* Hurdles */
        for (float hz = 10.0f; hz <= 30.0f; hz += 10.0f) {
            PushBox(0.0f, 0.45f, hz, 0.6f, 0.04f, 0.04f, 0.95f, 0.95f, 0.95f, 1.0f);
            PushBox(-0.55f, 0.22f, hz, 0.03f, 0.22f, 0.03f, 0.2f, 0.2f, 0.2f, 1.0f);
            PushBox(0.55f, 0.22f, hz, 0.03f, 0.22f, 0.03f, 0.2f, 0.2f, 0.2f, 1.0f);
        }
    }

    /* 2. 3D Kinect Player Skeleton Avatar (Real 20-joint bone hierarchy!) */
    if (skeleton && skeleton->eTrackingState != NUI_SKELETON_NOT_TRACKED) {
        const Vector4 *joints = skeleton->SkeletonPositions;
        const float b_rad = 0.04f;
        const float ar = 0.1f, ag = 0.85f, ab = 0.95f; /* Cyan Kinect energy glow */

        /* Torso */
        PushBone(&joints[NUI_SKELETON_POSITION_HIP_CENTER], &joints[NUI_SKELETON_POSITION_SPINE], b_rad * 1.3f, ar, ag, ab, 1.0f);
        PushBone(&joints[NUI_SKELETON_POSITION_SPINE], &joints[NUI_SKELETON_POSITION_SHOULDER_CENTER], b_rad * 1.3f, ar, ag, ab, 1.0f);
        PushBone(&joints[NUI_SKELETON_POSITION_SHOULDER_CENTER], &joints[NUI_SKELETON_POSITION_HEAD], b_rad * 1.2f, ar, ag, ab, 1.0f);

        /* Head sphere */
        PushSphere(joints[NUI_SKELETON_POSITION_HEAD].x, joints[NUI_SKELETON_POSITION_HEAD].y, joints[NUI_SKELETON_POSITION_HEAD].z, 0.14f, 0.95f, 0.85f, 0.25f, 1.0f);

        /* Left Arm */
        PushBone(&joints[NUI_SKELETON_POSITION_SHOULDER_CENTER], &joints[NUI_SKELETON_POSITION_SHOULDER_LEFT], b_rad, ar, ag, ab, 1.0f);
        PushBone(&joints[NUI_SKELETON_POSITION_SHOULDER_LEFT], &joints[NUI_SKELETON_POSITION_ELBOW_LEFT], b_rad, ar, ag, ab, 1.0f);
        PushBone(&joints[NUI_SKELETON_POSITION_ELBOW_LEFT], &joints[NUI_SKELETON_POSITION_WRIST_LEFT], b_rad, ar, ag, ab, 1.0f);
        PushBone(&joints[NUI_SKELETON_POSITION_WRIST_LEFT], &joints[NUI_SKELETON_POSITION_HAND_LEFT], b_rad * 1.2f, 0.2f, 0.9f, 0.4f, 1.0f);

        /* Right Arm */
        PushBone(&joints[NUI_SKELETON_POSITION_SHOULDER_CENTER], &joints[NUI_SKELETON_POSITION_SHOULDER_RIGHT], b_rad, ar, ag, ab, 1.0f);
        PushBone(&joints[NUI_SKELETON_POSITION_SHOULDER_RIGHT], &joints[NUI_SKELETON_POSITION_ELBOW_RIGHT], b_rad, ar, ag, ab, 1.0f);
        PushBone(&joints[NUI_SKELETON_POSITION_ELBOW_RIGHT], &joints[NUI_SKELETON_POSITION_WRIST_RIGHT], b_rad, ar, ag, ab, 1.0f);
        PushBone(&joints[NUI_SKELETON_POSITION_WRIST_RIGHT], &joints[NUI_SKELETON_POSITION_HAND_RIGHT], b_rad * 1.2f, 0.2f, 0.9f, 0.4f, 1.0f);

        /* Left Leg */
        PushBone(&joints[NUI_SKELETON_POSITION_HIP_CENTER], &joints[NUI_SKELETON_POSITION_HIP_LEFT], b_rad, ar, ag, ab, 1.0f);
        PushBone(&joints[NUI_SKELETON_POSITION_HIP_LEFT], &joints[NUI_SKELETON_POSITION_KNEE_LEFT], b_rad, ar, ag, ab, 1.0f);
        PushBone(&joints[NUI_SKELETON_POSITION_KNEE_LEFT], &joints[NUI_SKELETON_POSITION_ANKLE_LEFT], b_rad, ar, ag, ab, 1.0f);
        PushBone(&joints[NUI_SKELETON_POSITION_ANKLE_LEFT], &joints[NUI_SKELETON_POSITION_FOOT_LEFT], b_rad * 1.2f, 0.95f, 0.5f, 0.2f, 1.0f);

        /* Right Leg */
        PushBone(&joints[NUI_SKELETON_POSITION_HIP_CENTER], &joints[NUI_SKELETON_POSITION_HIP_RIGHT], b_rad, ar, ag, ab, 1.0f);
        PushBone(&joints[NUI_SKELETON_POSITION_HIP_RIGHT], &joints[NUI_SKELETON_POSITION_KNEE_RIGHT], b_rad, ar, ag, ab, 1.0f);
        PushBone(&joints[NUI_SKELETON_POSITION_KNEE_RIGHT], &joints[NUI_SKELETON_POSITION_ANKLE_RIGHT], b_rad, ar, ag, ab, 1.0f);
        PushBone(&joints[NUI_SKELETON_POSITION_ANKLE_RIGHT], &joints[NUI_SKELETON_POSITION_FOOT_RIGHT], b_rad * 1.2f, 0.95f, 0.5f, 0.2f, 1.0f);
    }
}

const D3D9_VERTEX* XenosGetVertexBuffer(void) {
    return g_VertexBuffer;
}

uint32_t XenosGetVertexCount(void) {
    return g_VertexCount;
}

uint32_t XenosGetDrawCallCount(void) {
    return g_TotalDrawCalls;
}

const XENOS_DRAW_COMMAND* XenosGetCommandBuffer(void) {
    return g_CommandBuffer;
}

uint32_t XenosGetCommandCount(void) {
    return g_CommandCount;
}

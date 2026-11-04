/**
 * Xbox 360 Xenos Graphics Direct3D 9 WebGPU Bridge
 * Kinect Sports (Title ID: 4D5308C9) - Web Port
 */

#ifndef XENOS_D3D9_H
#define XENOS_D3D9_H

#include "xenon_types.h"
#include "kinect_nui.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    D3DPT_POINTLIST = 1,
    D3DPT_LINELIST = 2,
    D3DPT_LINESTRIP = 3,
    D3DPT_TRIANGLELIST = 4,
    D3DPT_TRIANGLESTRIP = 5,
    D3DPT_TRIANGLEFAN = 6
} D3DPRIMITIVETYPE;

/* 32-byte aligned Vertex struct for WebGPU layout:
 * layout(location = 0) in vec3 pos;    (12 bytes)
 * layout(location = 1) in vec3 normal; (12 bytes)
 * layout(location = 2) in vec2 uv;     (8 bytes)
 * layout(location = 3) in vec4 color;  (16 bytes) -> Total 48 bytes
 */
typedef struct {
    float x, y, z;
    float nx, ny, nz;
    float u, v;
    float r, g, b, a;
} D3D9_VERTEX;

typedef struct {
    uint32_t primitive_type;
    uint32_t primitive_count;
    uint32_t start_vertex;
    uint32_t vertex_count;
    uint32_t texture_id;
    float    world_matrix[16];
    float    view_proj_matrix[16];
} XENOS_DRAW_COMMAND;

/* Graphics Bridge API */
int  XenosInitRenderer(uint32_t width, uint32_t height);
void XenosBeginFrame(void);
void XenosEndFrame(void);
void XenosResetVertexBuffer(void);
void XenosPushVertex(float x, float y, float z, float nx, float ny, float nz, float u, float v, float r, float g, float b, float a);
void XenosBuildSportMesh(uint32_t sport_id, float ball_x, float ball_y, float ball_z, const NUI_SKELETON_DATA *skeleton);

const D3D9_VERTEX*        XenosGetVertexBuffer(void);
uint32_t                  XenosGetVertexCount(void);
uint32_t                  XenosGetDrawCallCount(void);
const XENOS_DRAW_COMMAND* XenosGetCommandBuffer(void);
uint32_t                  XenosGetCommandCount(void);

#ifdef __cplusplus
}
#endif

#endif /* XENOS_D3D9_H */

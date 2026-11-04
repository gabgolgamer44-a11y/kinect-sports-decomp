/**
 * Xbox 360 Xenon Unified Memory Manager Implementation
 * Kinect Sports (Title ID: 4D5308C9) - Web Port
 */

#include "xenon_memory.h"
#include "freestanding_libc.h"

#define XENON_STATIC_POOL_SIZE (32 * 1024 * 1024) /* 32 MB arena in WASM linear memory */

static uint8_t  g_MemoryPool[XENON_STATIC_POOL_SIZE];
static size_t   g_MemorySize = XENON_STATIC_POOL_SIZE;
static uint32_t g_HeapCurrent = 0x82800000U; /* Dynamic heap start */

int XenonMemoryInit(size_t pool_size) {
    (void)pool_size;
    memset(g_MemoryPool, 0, sizeof(g_MemoryPool));
    g_MemorySize = sizeof(g_MemoryPool);
    g_HeapCurrent = XENON_BASE_ADDR + 0x00800000U;
    return 0;
}

void XenonMemoryShutdown(void) {
    memset(g_MemoryPool, 0, sizeof(g_MemoryPool));
    g_HeapCurrent = XENON_BASE_ADDR + 0x00800000U;
}

void* XenonTranslateAddress(uint32_t xenon_addr) {
    if (xenon_addr < XENON_BASE_ADDR) {
        return NULL;
    }
    uint32_t offset = xenon_addr - XENON_BASE_ADDR;
    if (offset >= g_MemorySize) {
        return NULL;
    }
    return (void*)(g_MemoryPool + offset);
}

uint32_t XenonHostToPointer(const void *host_ptr) {
    if (!host_ptr) {
        return 0;
    }
    const uint8_t *p = (const uint8_t*)host_ptr;
    if (p < g_MemoryPool || p >= g_MemoryPool + g_MemorySize) {
        return 0;
    }
    return XENON_BASE_ADDR + (uint32_t)(p - g_MemoryPool);
}

uint32_t XenonReadU32(uint32_t xenon_addr) {
    if (xenon_addr < XENON_BASE_ADDR || (xenon_addr - XENON_BASE_ADDR) + sizeof(uint32_t) > g_MemorySize) {
        return 0;
    }
    void *ptr = XenonTranslateAddress(xenon_addr);
    if (!ptr) return 0;
    uint32_t val;
    memcpy(&val, ptr, sizeof(uint32_t));
    return bswap32(val);
}

void XenonWriteU32(uint32_t xenon_addr, uint32_t val) {
    if (xenon_addr < XENON_BASE_ADDR || (xenon_addr - XENON_BASE_ADDR) + sizeof(uint32_t) > g_MemorySize) {
        return;
    }
    void *ptr = XenonTranslateAddress(xenon_addr);
    if (!ptr) return;
    uint32_t be = bswap32(val);
    memcpy(ptr, &be, sizeof(uint32_t));
}

float XenonReadF32(uint32_t xenon_addr) {
    if (xenon_addr < XENON_BASE_ADDR || (xenon_addr - XENON_BASE_ADDR) + sizeof(float) > g_MemorySize) {
        return 0.0f;
    }
    void *ptr = XenonTranslateAddress(xenon_addr);
    if (!ptr) return 0.0f;
    float val;
    memcpy(&val, ptr, sizeof(float));
    return bswap_float(val);
}

void XenonWriteF32(uint32_t xenon_addr, float val) {
    if (xenon_addr < XENON_BASE_ADDR || (xenon_addr - XENON_BASE_ADDR) + sizeof(float) > g_MemorySize) {
        return;
    }
    void *ptr = XenonTranslateAddress(xenon_addr);
    if (!ptr) return;
    float be = bswap_float(val);
    memcpy(ptr, &be, sizeof(float));
}

uint32_t XenonAlloc(uint32_t bytes, uint32_t alignment) {
    if (bytes == 0 || g_MemorySize == 0) return 0;
    if (alignment == 0) alignment = 16;
    uint32_t aligned = (g_HeapCurrent + (alignment - 1)) & ~(alignment - 1);
    if (aligned < XENON_BASE_ADDR || (aligned - XENON_BASE_ADDR) + bytes > g_MemorySize) {
        return 0; /* Out of Xenon heap memory */
    }
    g_HeapCurrent = aligned + bytes;
    return aligned;
}

void XenonFree(uint32_t xenon_addr) {
    (void)xenon_addr;
}

void* XenonGetRawPoolPtr(void) {
    return g_MemoryPool;
}

uint32_t XenonGetPoolSize(void) {
    return (uint32_t)g_MemorySize;
}

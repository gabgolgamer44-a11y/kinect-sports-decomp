/**
 * Xbox 360 Xenon Unified Memory Manager for WebAssembly Port
 * Kinect Sports (Title ID: 4D5308C9)
 */

#ifndef XENON_MEMORY_H
#define XENON_MEMORY_H

#include "xenon_types.h"

#ifdef __cplusplus
extern "C" {
#endif

#define XENON_BASE_ADDR        0x82000000U
#define XENON_RAM_SIZE         (32 * 1024 * 1024)  /* 32 MB linear memory */
#define XENON_VIRTUAL_MASK     0x01FFFFFFU

/* Initialize Xenon memory arena */
int  XenonMemoryInit(size_t pool_size);
void XenonMemoryShutdown(void);

/* Address conversion between Xenon 32-bit virtual address and host/WASM pointer */
void*    XenonTranslateAddress(uint32_t xenon_addr);
uint32_t XenonHostToPointer(const void *host_ptr);

/* Safe big-endian memory reading and writing */
uint32_t XenonReadU32(uint32_t xenon_addr);
void     XenonWriteU32(uint32_t xenon_addr, uint32_t val);
float    XenonReadF32(uint32_t xenon_addr);
void     XenonWriteF32(uint32_t xenon_addr, float val);

/* Heap allocation in Xenon space */
uint32_t XenonAlloc(uint32_t bytes, uint32_t alignment);
void     XenonFree(uint32_t xenon_addr);

void*    XenonGetRawPoolPtr(void);
uint32_t XenonGetPoolSize(void);

#ifdef __cplusplus
}
#endif

#endif /* XENON_MEMORY_H */

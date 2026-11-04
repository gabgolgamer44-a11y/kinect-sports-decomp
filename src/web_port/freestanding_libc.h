/**
 * Minimal Freestanding LibC & Math for WebAssembly (WASM32) Compilation
 * Kinect Sports (Title ID: 4D5308C9) - Web Port
 */

#ifndef FREESTANDING_LIBC_H
#define FREESTANDING_LIBC_H

#include "xenon_types.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Memory and string functions */
void*  memcpy(void *dest, const void *src, size_t n);
void*  memset(void *s, int c, size_t n);
int    memcmp(const void *s1, const void *s2, size_t n);
size_t strlen(const char *s);

/* Math functions */
float fabsf(float x);
float sqrtf(float x);
float sinf(float x);
float cosf(float x);
float floorf(float x);
float ceilf(float x);

#ifdef __cplusplus
}
#endif

#endif /* FREESTANDING_LIBC_H */

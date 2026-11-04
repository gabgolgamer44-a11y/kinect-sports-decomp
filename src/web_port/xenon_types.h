/**
 * Xbox 360 Xenon Platform & Type Definitions for WebAssembly Port
 * Kinect Sports (Title ID: 4D5308C9)
 */

#ifndef XENON_TYPES_H
#define XENON_TYPES_H

#include <stdint.h>
#include <stdbool.h>
#ifndef NULL
#define NULL ((void*)0)
#endif

typedef unsigned long size_t;



/* Basic Xbox 360 types */
typedef uint8_t   undefined1;
typedef uint8_t   byte;
typedef uint8_t   undefined;
typedef uint8_t   U8;
typedef int8_t    S8;

typedef uint16_t  undefined2;
typedef uint16_t  ushort;
typedef uint16_t  word;
typedef uint16_t  U16;
typedef int16_t   S16;

typedef uint32_t  undefined4;
typedef uint32_t  uint;
typedef uint32_t  dword;
typedef uint32_t  ulong;
typedef uint32_t  U32;
typedef int32_t   S32;

typedef uint64_t  undefined8;
typedef uint64_t  ulonglong;
typedef uint64_t  qword;
typedef uint64_t  U64;
typedef int64_t   longlong;
typedef int64_t   S64;

typedef float     F32;
typedef double    F64;

typedef int (*code)();

/* 128-bit SIMD / AltiVec / VMX128 vector */
typedef struct {
    uint64_t lo;
    uint64_t hi;
} V16;

typedef union {
    float    f[4];
    uint32_t u[4];
    int32_t  i[4];
    uint8_t  b[16];
    V16      v;
} __vector4;

/* 3D / 4D Vector structure */
typedef struct {
    float x;
    float y;
    float z;
    float w;
} Vector4;

typedef struct {
    float x;
    float y;
    float z;
} Vector3;

/* Endianness Conversion Utilities (Xbox 360 PowerPC is Big-Endian, WebAssembly is Little-Endian) */
static inline uint16_t bswap16(uint16_t val) {
    return (uint16_t)((val << 8) | (val >> 8));
}

static inline uint32_t bswap32(uint32_t val) {
    return ((val << 24) & 0xFF000000U) |
           ((val << 8)  & 0x00FF0000U) |
           ((val >> 8)  & 0x0000FF00U) |
           ((val >> 24) & 0x000000FFU);
}

static inline uint64_t bswap64(uint64_t val) {
    return (((uint64_t)bswap32((uint32_t)(val & 0xFFFFFFFFU))) << 32) |
           ((uint64_t)bswap32((uint32_t)(val >> 32)));
}

static inline float bswap_float(float val) {
    union { float f; uint32_t u; } src, dst;
    src.f = val;
    dst.u = bswap32(src.u);
    return dst.f;
}

#endif /* XENON_TYPES_H */

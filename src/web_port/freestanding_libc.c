/**
 * Minimal Freestanding LibC & Math Implementation for WebAssembly
 * Kinect Sports (Title ID: 4D5308C9) - Web Port
 */

#include "freestanding_libc.h"

void* memcpy(void *dest, const void *src, size_t n) {
    uint8_t *d = (uint8_t*)dest;
    const uint8_t *s = (const uint8_t*)src;
    while (n--) *d++ = *s++;
    return dest;
}

void* memset(void *s, int c, size_t n) {
    uint8_t *p = (uint8_t*)s;
    while (n--) *p++ = (uint8_t)c;
    return s;
}

int memcmp(const void *s1, const void *s2, size_t n) {
    const uint8_t *p1 = (const uint8_t*)s1;
    const uint8_t *p2 = (const uint8_t*)s2;
    while (n--) {
        if (*p1 != *p2) return *p1 - *p2;
        p1++; p2++;
    }
    return 0;
}

size_t strlen(const char *s) {
    size_t len = 0;
    while (s && *s++) len++;
    return len;
}

float fabsf(float x) {
    return x < 0.0f ? -x : x;
}

float sqrtf(float x) {
    return __builtin_sqrtf(x);
}

float floorf(float x) {
    return __builtin_floorf(x);
}

float ceilf(float x) {
    return __builtin_ceilf(x);
}

float sinf(float x) {
    const float PI = 3.14159265358979323846f;
    const float TWO_PI = 6.28318530717958647692f;
    while (x > PI) x -= TWO_PI;
    while (x < -PI) x += TWO_PI;
    float x2 = x * x;
    return x * (1.0f - x2 * (1.0f / 6.0f - x2 * (1.0f / 120.0f - x2 * (1.0f / 5040.0f))));
}

float cosf(float x) {
    const float HALF_PI = 1.57079632679489661923f;
    return sinf(x + HALF_PI);
}

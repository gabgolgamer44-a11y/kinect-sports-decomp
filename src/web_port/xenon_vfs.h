/**
 * Xbox 360 Xenon Virtual File System (wasm_httpfs) for Web Port
 * Kinect Sports (Title ID: 4D5308C9) - Padrão playgta5.com
 */

#ifndef XENON_VFS_H
#define XENON_VFS_H

#include "xenon_types.h"
#include "freestanding_libc.h"

#ifdef __cplusplus
extern "C" {
#endif

#define MAX_VFS_FILES       32
#define VFS_CHUNK_SIZE      65536 /* 64 KB chunk size */
#define MAX_FILE_PATH_LEN   128

typedef struct {
    char     path[MAX_FILE_PATH_LEN];
    uint32_t file_id;
    uint32_t total_size;
    uint32_t loaded_bytes;
    bool     is_open;
    bool     is_complete;
    uint8_t *cached_buffer;
} XENON_VFS_FILE;

/* VFS API */
int      XenonVFS_Init(void);
int      XenonVFS_RegisterFile(const char *path, uint32_t file_id, uint32_t total_size);
int      XenonVFS_OpenFile(const char *path);
int      XenonVFS_ReadFile(int fd, void *buffer, uint32_t size, uint32_t offset);
uint32_t XenonVFS_GetFileSize(int fd);
void     XenonVFS_CloseFile(int fd);
int      XenonVFS_ReceiveChunk(uint32_t file_id, uint32_t offset, const uint8_t *data, uint32_t length);

/* External JavaScript host callbacks */
extern void js_vfs_request_chunk(uint32_t file_id, uint32_t offset, uint32_t length);
extern void js_vfs_on_file_opened(uint32_t file_id, const char *path);

#ifdef __cplusplus
}
#endif

#endif /* XENON_VFS_H */

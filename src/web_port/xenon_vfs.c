/**
 * Xbox 360 Xenon Virtual File System (wasm_httpfs) Implementation
 * Kinect Sports (Title ID: 4D5308C9) - Padrão playgta5.com
 */

#include "xenon_vfs.h"
#include "xenon_memory.h"
#include "freestanding_libc.h"

static XENON_VFS_FILE g_Files[MAX_VFS_FILES];
static bool g_VfsInitialized = false;

/* Fallback weak implementations of JS hooks if not bound */
__attribute__((weak)) void js_vfs_request_chunk(uint32_t file_id, uint32_t offset, uint32_t length) {
    (void)file_id; (void)offset; (void)length;
}

__attribute__((weak)) void js_vfs_on_file_opened(uint32_t file_id, const char *path) {
    (void)file_id; (void)path;
}

int XenonVFS_Init(void) {
    memset(g_Files, 0, sizeof(g_Files));
    g_VfsInitialized = true;
    
    /* Pre-register primary Kinect Sports game packages */
    XenonVFS_RegisterFile("d:\\database.xmplr", 1, 12785000); /* 12.7 MB metadata DB */
    XenonVFS_RegisterFile("d:\\AM\\Football\\stadium.geo", 2, 4520000);
    XenonVFS_RegisterFile("d:\\AM\\Bowling\\lane.geo", 3, 3810000);
    XenonVFS_RegisterFile("d:\\AM\\Boxing\\ring.geo", 4, 3200000);
    XenonVFS_RegisterFile("d:\\AM\\Volleyball\\court.geo", 5, 2900000);
    XenonVFS_RegisterFile("d:\\AM\\TableTennis\\table.geo", 6, 2100000);
    XenonVFS_RegisterFile("d:\\AM\\TrackAndField\\stadium.geo", 7, 5100000);

    return 0;
}

int XenonVFS_RegisterFile(const char *path, uint32_t file_id, uint32_t total_size) {
    if (!path || file_id == 0) return -1;
    
    for (int i = 0; i < MAX_VFS_FILES; i++) {
        if (!g_Files[i].is_open && g_Files[i].file_id == 0) {
            size_t len = strlen(path);
            if (len >= MAX_FILE_PATH_LEN) len = MAX_FILE_PATH_LEN - 1;
            memcpy(g_Files[i].path, path, len);
            g_Files[i].path[len] = '\0';
            g_Files[i].file_id = file_id;
            g_Files[i].total_size = total_size;
            g_Files[i].loaded_bytes = 0;
            g_Files[i].is_open = false;
            g_Files[i].is_complete = false;
            g_Files[i].cached_buffer = NULL;
            return i;
        }
    }
    return -1;
}

int XenonVFS_OpenFile(const char *path) {
    if (!path) return -1;
    if (!g_VfsInitialized) XenonVFS_Init();

    for (int i = 0; i < MAX_VFS_FILES; i++) {
        if (g_Files[i].file_id != 0) {
            /* Case-insensitive or suffix compare */
            const char *p1 = path;
            const char *p2 = g_Files[i].path;
            bool match = true;
            while (*p1 && *p2) {
                char c1 = *p1++;
                char c2 = *p2++;
                if (c1 >= 'A' && c1 <= 'Z') c1 += 32;
                if (c2 >= 'A' && c2 <= 'Z') c2 += 32;
                if (c1 != c2) { match = false; break; }
            }
            if (match) {
                g_Files[i].is_open = true;
                js_vfs_on_file_opened(g_Files[i].file_id, g_Files[i].path);
                return i;
            }
        }
    }
    return -1;
}

int XenonVFS_ReadFile(int fd, void *buffer, uint32_t size, uint32_t offset) {
    if (fd < 0 || fd >= MAX_VFS_FILES || !g_Files[fd].is_open || !buffer) {
        return -1;
    }
    XENON_VFS_FILE *file = &g_Files[fd];
    if (offset >= file->total_size) {
        return 0; /* EOF */
    }

    uint32_t available = file->total_size - offset;
    uint32_t to_read = (size < available) ? size : available;

    if (file->cached_buffer) {
        memcpy(buffer, file->cached_buffer + offset, to_read);
        return (int)to_read;
    }

    /* Request chunk from JS HTTP streaming layer */
    js_vfs_request_chunk(file->file_id, offset, to_read);
    return (int)to_read;
}

uint32_t XenonVFS_GetFileSize(int fd) {
    if (fd < 0 || fd >= MAX_VFS_FILES || !g_Files[fd].is_open) {
        return 0;
    }
    return g_Files[fd].total_size;
}

void XenonVFS_CloseFile(int fd) {
    if (fd >= 0 && fd < MAX_VFS_FILES) {
        g_Files[fd].is_open = false;
    }
}

int XenonVFS_ReceiveChunk(uint32_t file_id, uint32_t offset, const uint8_t *data, uint32_t length) {
    if (!data || length == 0) return -1;

    for (int i = 0; i < MAX_VFS_FILES; i++) {
        if (g_Files[i].file_id == file_id) {
            /* If we haven't allocated a buffer, or we update bytes */
            g_Files[i].loaded_bytes += length;
            if (g_Files[i].loaded_bytes >= g_Files[i].total_size) {
                g_Files[i].is_complete = true;
            }
            return 0;
        }
    }
    return -1;
}

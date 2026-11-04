/**
 * Kinect NUI (Natural User Interface) WebAssembly Implementation
 * Kinect Sports (Title ID: 4D5308C9) - Web Port
 */

#include "kinect_nui.h"
#include "freestanding_libc.h"

static NUI_SKELETON_FRAME g_CurrentFrame;
static NUI_GESTURE_EVENT  g_LatestGesture;
static bool               g_IsInitialized = false;
static uint32_t           g_FrameCounter = 0;

int NuiInitialize(uint32_t dwFlags) {
    (void)dwFlags;
    memset(&g_CurrentFrame, 0, sizeof(g_CurrentFrame));
    memset(&g_LatestGesture, 0, sizeof(g_LatestGesture));
    g_IsInitialized = true;
    g_FrameCounter = 0;
    return 0; /* S_OK */
}

void NuiShutdown(void) {
    g_IsInitialized = false;
}

int NuiSkeletonGetNextFrame(uint32_t dwMillisecondsToWait, NUI_SKELETON_FRAME *pSkeletonFrame) {
    (void)dwMillisecondsToWait;
    if (!g_IsInitialized || !pSkeletonFrame) {
        return -1;
    }
    memcpy(pSkeletonFrame, &g_CurrentFrame, sizeof(NUI_SKELETON_FRAME));
    return 0;
}

/* Receives flattened 3D landmarks (x, y, z) from MediaPipe Webcam tracker */
int NuiSetWebcamSkeleton(const float *landmarks_flat_xyz, int landmark_count, float confidence) {
    if (!landmarks_flat_xyz || landmark_count < 33) {
        return -1;
    }

    g_FrameCounter++;
    g_CurrentFrame.dwFrameNumber = g_FrameCounter;
    g_CurrentFrame.liTimeStamp = (int64_t)g_FrameCounter * 333333; /* ~30fps */

    NUI_SKELETON_DATA *skel = &g_CurrentFrame.SkeletonData[0];
    skel->dwTrackingID = 1;
    skel->eTrackingState = (confidence > 0.4f) ? NUI_SKELETON_TRACKED : NUI_SKELETON_POSITION_ONLY;

    #define MP_LM(idx) (&landmarks_flat_xyz[(idx) * 3])

    const float *lm_nose = MP_LM(0);
    const float *lm_l_sho = MP_LM(11);
    const float *lm_r_sho = MP_LM(12);
    const float *lm_l_elb = MP_LM(13);
    const float *lm_r_elb = MP_LM(14);
    const float *lm_l_wri = MP_LM(15);
    const float *lm_r_wri = MP_LM(16);
    const float *lm_l_hip = MP_LM(23);
    const float *lm_r_hip = MP_LM(24);
    const float *lm_l_kne = MP_LM(25);
    const float *lm_r_kne = MP_LM(26);
    const float *lm_l_ank = MP_LM(27);
    const float *lm_r_ank = MP_LM(28);
    const float *lm_l_foo = MP_LM(31);
    const float *lm_r_foo = MP_LM(32);

    /* Helper lambda to assign joint coordinates with Kinect metric space conversion */
    #define SET_JOINT(joint_enum, src_x, src_y, src_z) do { \
        skel->SkeletonPositions[joint_enum].x = ((src_x) - 0.5f) * 2.5f; \
        skel->SkeletonPositions[joint_enum].y = (1.0f - (src_y)) * 2.2f - 1.0f; \
        skel->SkeletonPositions[joint_enum].z = ((src_z) * 2.0f) + 2.0f; \
        skel->SkeletonPositions[joint_enum].w = 1.0f; \
        skel->eSkeletonPositionTrackingState[joint_enum] = NUI_SKELETON_POSITION_TRACKED; \
    } while(0)

    /* Center of hips */
    float hip_cx = (lm_l_hip[0] + lm_r_hip[0]) * 0.5f;
    float hip_cy = (lm_l_hip[1] + lm_r_hip[1]) * 0.5f;
    float hip_cz = (lm_l_hip[2] + lm_r_hip[2]) * 0.5f;
    SET_JOINT(NUI_SKELETON_POSITION_HIP_CENTER, hip_cx, hip_cy, hip_cz);

    /* Center of shoulders */
    float sho_cx = (lm_l_sho[0] + lm_r_sho[0]) * 0.5f;
    float sho_cy = (lm_l_sho[1] + lm_r_sho[1]) * 0.5f;
    float sho_cz = (lm_l_sho[2] + lm_r_sho[2]) * 0.5f;
    SET_JOINT(NUI_SKELETON_POSITION_SHOULDER_CENTER, sho_cx, sho_cy, sho_cz);

    /* Spine */
    float spine_x = (hip_cx + sho_cx) * 0.5f;
    float spine_y = (hip_cy + sho_cy) * 0.5f;
    float spine_z = (hip_cz + sho_cz) * 0.5f;
    SET_JOINT(NUI_SKELETON_POSITION_SPINE, spine_x, spine_y, spine_z);

    /* Head */
    SET_JOINT(NUI_SKELETON_POSITION_HEAD, lm_nose[0], lm_nose[1], lm_nose[2]);

    /* Arms */
    SET_JOINT(NUI_SKELETON_POSITION_SHOULDER_LEFT, lm_l_sho[0], lm_l_sho[1], lm_l_sho[2]);
    SET_JOINT(NUI_SKELETON_POSITION_ELBOW_LEFT, lm_l_elb[0], lm_l_elb[1], lm_l_elb[2]);
    SET_JOINT(NUI_SKELETON_POSITION_WRIST_LEFT, lm_l_wri[0], lm_l_wri[1], lm_l_wri[2]);
    SET_JOINT(NUI_SKELETON_POSITION_HAND_LEFT, lm_l_wri[0], lm_l_wri[1], lm_l_wri[2]);

    SET_JOINT(NUI_SKELETON_POSITION_SHOULDER_RIGHT, lm_r_sho[0], lm_r_sho[1], lm_r_sho[2]);
    SET_JOINT(NUI_SKELETON_POSITION_ELBOW_RIGHT, lm_r_elb[0], lm_r_elb[1], lm_r_elb[2]);
    SET_JOINT(NUI_SKELETON_POSITION_WRIST_RIGHT, lm_r_wri[0], lm_r_wri[1], lm_r_wri[2]);
    SET_JOINT(NUI_SKELETON_POSITION_HAND_RIGHT, lm_r_wri[0], lm_r_wri[1], lm_r_wri[2]);

    /* Legs */
    SET_JOINT(NUI_SKELETON_POSITION_HIP_LEFT, lm_l_hip[0], lm_l_hip[1], lm_l_hip[2]);
    SET_JOINT(NUI_SKELETON_POSITION_KNEE_LEFT, lm_l_kne[0], lm_l_kne[1], lm_l_kne[2]);
    SET_JOINT(NUI_SKELETON_POSITION_ANKLE_LEFT, lm_l_ank[0], lm_l_ank[1], lm_l_ank[2]);
    SET_JOINT(NUI_SKELETON_POSITION_FOOT_LEFT, lm_l_foo[0], lm_l_foo[1], lm_l_foo[2]);

    SET_JOINT(NUI_SKELETON_POSITION_HIP_RIGHT, lm_r_hip[0], lm_r_hip[1], lm_r_hip[2]);
    SET_JOINT(NUI_SKELETON_POSITION_KNEE_RIGHT, lm_r_kne[0], lm_r_kne[1], lm_r_kne[2]);
    SET_JOINT(NUI_SKELETON_POSITION_ANKLE_RIGHT, lm_r_ank[0], lm_r_ank[1], lm_r_ank[2]);
    SET_JOINT(NUI_SKELETON_POSITION_FOOT_RIGHT, lm_r_foo[0], lm_r_foo[1], lm_r_foo[2]);

    #undef SET_JOINT
    #undef MP_LM

    /* Skeleton overall position */
    skel->Position = skel->SkeletonPositions[NUI_SKELETON_POSITION_HIP_CENTER];
    return 0;
}

int NuiDispatchGestureEvent(const NUI_GESTURE_EVENT *event) {
    if (!event) return -1;
    memcpy(&g_LatestGesture, event, sizeof(NUI_GESTURE_EVENT));
    return 0;
}

void NuiGetLatestGesture(NUI_GESTURE_EVENT *out_event) {
    if (out_event) {
        memcpy(out_event, &g_LatestGesture, sizeof(NUI_GESTURE_EVENT));
    }
}

const NUI_SKELETON_DATA* NuiGetTrackedSkeleton(void) {
    return &g_CurrentFrame.SkeletonData[0];
}

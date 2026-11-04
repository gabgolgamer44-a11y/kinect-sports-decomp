/**
 * Kinect NUI (Natural User Interface) WebAssembly Shim
 * Kinect Sports (Title ID: 4D5308C9)
 */

#ifndef KINECT_NUI_H
#define KINECT_NUI_H

#include "xenon_types.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Kinect NUI 20 Skeleton Joint Indices */
typedef enum {
    NUI_SKELETON_POSITION_HIP_CENTER = 0,
    NUI_SKELETON_POSITION_SPINE,
    NUI_SKELETON_POSITION_SHOULDER_CENTER,
    NUI_SKELETON_POSITION_HEAD,
    NUI_SKELETON_POSITION_SHOULDER_LEFT,
    NUI_SKELETON_POSITION_ELBOW_LEFT,
    NUI_SKELETON_POSITION_WRIST_LEFT,
    NUI_SKELETON_POSITION_HAND_LEFT,
    NUI_SKELETON_POSITION_SHOULDER_RIGHT,
    NUI_SKELETON_POSITION_ELBOW_RIGHT,
    NUI_SKELETON_POSITION_WRIST_RIGHT,
    NUI_SKELETON_POSITION_HAND_RIGHT,
    NUI_SKELETON_POSITION_HIP_LEFT,
    NUI_SKELETON_POSITION_KNEE_LEFT,
    NUI_SKELETON_POSITION_ANKLE_LEFT,
    NUI_SKELETON_POSITION_FOOT_LEFT,
    NUI_SKELETON_POSITION_HIP_RIGHT,
    NUI_SKELETON_POSITION_KNEE_RIGHT,
    NUI_SKELETON_POSITION_ANKLE_RIGHT,
    NUI_SKELETON_POSITION_FOOT_RIGHT,
    NUI_SKELETON_POSITION_COUNT = 20
} NUI_SKELETON_POSITION_INDEX;

/* Joint Tracking State */
typedef enum {
    NUI_SKELETON_POSITION_NOT_TRACKED = 0,
    NUI_SKELETON_POSITION_INFERRED = 1,
    NUI_SKELETON_POSITION_TRACKED = 2
} NUI_SKELETON_POSITION_TRACKING_STATE;

/* Skeleton Tracking State */
typedef enum {
    NUI_SKELETON_NOT_TRACKED = 0,
    NUI_SKELETON_POSITION_ONLY = 1,
    NUI_SKELETON_TRACKED = 2
} NUI_SKELETON_TRACKING_STATE;

/* Kinect Sports Sports Categories */
typedef enum {
    KS_SPORT_NONE = 0,
    KS_SPORT_FOOTBALL = 1,
    KS_SPORT_BOWLING = 2,
    KS_SPORT_BOXING = 3,
    KS_SPORT_VOLLEYBALL = 4,
    KS_SPORT_TABLETENNIS = 5,
    KS_SPORT_TRACKANDFIELD = 6,
    KS_SPORT_MAINMENU = 7
} KS_SPORT_ID;

/* Single Skeleton Joint Data */
typedef struct {
    Vector4                               SkeletonPositions[NUI_SKELETON_POSITION_COUNT];
    NUI_SKELETON_POSITION_TRACKING_STATE eSkeletonPositionTrackingState[NUI_SKELETON_POSITION_COUNT];
    NUI_SKELETON_TRACKING_STATE          eTrackingState;
    uint32_t                             dwTrackingID;
    uint32_t                             dwEnrollmentIndex;
    uint32_t                             dwUserIndex;
    Vector4                               Position;
    uint32_t                             dwQualityFlags;
} NUI_SKELETON_DATA;

/* Skeleton Frame (supports up to 6 players, 2 fully tracked) */
#define NUI_SKELETON_COUNT 6

typedef struct {
    int64_t           liTimeStamp;
    uint32_t          dwFrameNumber;
    uint32_t          dwFlags;
    Vector4           vFloorClipPlane;
    Vector4           vNormalToGravity;
    NUI_SKELETON_DATA SkeletonData[NUI_SKELETON_COUNT];
} NUI_SKELETON_FRAME;

/* Detected Gestures / Event Data from Webcam MediaPipe Bridge */
typedef struct {
    uint32_t sport_id;
    uint32_t gesture_type; /* 1: Kick, 2: Bowling Swing, 3: Punch Left, 4: Punch Right, 5: Jump, 6: Volleyball Spike, 7: Table Tennis Forehand, 8: Table Tennis Backhand */
    float    velocity;
    float    direction_x;
    float    direction_y;
    float    direction_z;
    float    confidence;
    uint32_t timestamp_ms;
} NUI_GESTURE_EVENT;

/* Global Kinect NUI API functions */
int  NuiInitialize(uint32_t dwFlags);
void NuiShutdown(void);
int  NuiSkeletonGetNextFrame(uint32_t dwMillisecondsToWait, NUI_SKELETON_FRAME *pSkeletonFrame);
int  NuiSetWebcamSkeleton(const float *landmarks_flat_xyz, int landmark_count, float confidence);
int  NuiDispatchGestureEvent(const NUI_GESTURE_EVENT *event);
void NuiGetLatestGesture(NUI_GESTURE_EVENT *out_event);
const NUI_SKELETON_DATA* NuiGetTrackedSkeleton(void);

#ifdef __cplusplus
}
#endif

#endif /* KINECT_NUI_H */

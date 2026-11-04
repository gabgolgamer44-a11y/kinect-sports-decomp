cmake_minimum_required(VERSION 3.15)
project(kinect_sports_web C)

set(CMAKE_C_STANDARD 11)

include_directories(
    .
    ../..
    ../../src
)

set(SOURCES
    web_main.c
    kinect_nui.c
    xenon_memory.c
    xenos_d3d9.c
)

add_executable(kinect_sports_web ${SOURCES})

if (EMSCRIPTEN)
    set_target_properties(kinect_sports_web PROPERTIES
        OUTPUT_NAME "kinect_sports"
        SUFFIX ".js"
    )
    target_link_options(kinect_sports_web PRIVATE
        "-sWASM=1"
        "-sALLOW_MEMORY_GROWTH=1"
        "-sINITIAL_MEMORY=67108864"
        "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','setValue']"
        "-sEXPORTED_FUNCTIONS=['_ks_init','_ks_shutdown','_ks_select_sport','_ks_feed_kinect_skeleton','_ks_trigger_gesture','_ks_inject_controller','_ks_update','_ks_render','_ks_get_state_ptr','_ks_get_score_player','_ks_get_score_opponent','_ks_get_ball_z','_ks_get_command_buffer','_ks_get_command_count','_malloc','_free']"
        "-O3"
    )
endif()

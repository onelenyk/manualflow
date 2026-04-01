package com.maestrorecorder.dashboard.session

sealed class SessionState {
    data object Idle : SessionState()
    data object Recording : SessionState()
    data object Stopping : SessionState()
}

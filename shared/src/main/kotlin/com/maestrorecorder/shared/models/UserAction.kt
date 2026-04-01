package com.maestrorecorder.shared.models

sealed class UserAction {
    abstract val timestampMs: Long

    data class Tap(
        val x: Int,
        val y: Int,
        override val timestampMs: Long
    ) : UserAction()
}

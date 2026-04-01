package com.maestrorecorder.dashboard.model

import kotlinx.serialization.Serializable

@Serializable
data class RecordingWsMessage(
    val type: String, // "command" or "status"
    val command: CommandDto? = null,
    val state: String? = null,
    val message: String? = null
)

@Serializable
data class RunWsMessage(
    val type: String, // "stdout" or "completed"
    val line: String? = null,
    val exitCode: Int? = null
)

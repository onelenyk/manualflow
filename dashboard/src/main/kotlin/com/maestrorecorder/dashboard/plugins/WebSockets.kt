package com.maestrorecorder.dashboard.plugins

import io.ktor.server.application.*
import io.ktor.server.websocket.*
import kotlin.time.Duration.Companion.seconds

fun Application.configureWebSockets() {
    install(WebSockets) {
        pingPeriodMillis = 15.seconds.inWholeMilliseconds
        timeoutMillis = 30.seconds.inWholeMilliseconds
        maxFrameSize = Long.MAX_VALUE
        masking = false
    }
}

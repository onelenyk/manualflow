package com.maestrorecorder.dashboard.routes

import com.maestrorecorder.cli.recorder.SessionConfig
import com.maestrorecorder.dashboard.model.*
import com.maestrorecorder.dashboard.session.DashboardRecordingSession
import com.maestrorecorder.dashboard.session.DashboardState
import com.maestrorecorder.dashboard.session.SessionState
import com.maestrorecorder.shared.models.MaestroCommand
import com.maestrorecorder.shared.models.TapOnSelector
import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.nio.file.Path

fun Route.recordingRoutes(state: DashboardState) {
    val recordingScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val json = Json { prettyPrint = false }

    route("/recording") {
        post("/start") {
            if (state.recordingSession?.state?.value is SessionState.Recording) {
                call.respond(HttpStatusCode.Conflict, ErrorResponse("Recording already in progress"))
                return@post
            }

            val request = call.receive<RecordingStartRequest>()
            val config = SessionConfig(
                outputFile = Path.of("/tmp/maestro-recorder-last.yaml"),
                appId = request.appId,
                deviceSerial = request.deviceSerial,
                grpcPort = request.grpcPort
            )

            try {
                val session = DashboardRecordingSession(config, state.adb, state.deviceManager)
                state.recordingSession = session
                session.start(recordingScope)
                call.respond(RecordingStartResponse(status = "recording", message = "Recording started"))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, ErrorResponse(e.message ?: "Failed to start"))
            }
        }

        post("/stop") {
            val session = state.recordingSession
            if (session == null) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("No recording in progress"))
                return@post
            }

            try {
                val yaml = session.stop()
                val commands = session.collectedCommands.map { it.toDto() }
                state.recordingSession = null
                call.respond(RecordingStopResponse(yaml = yaml, commandCount = commands.size))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, ErrorResponse(e.message ?: "Failed to stop"))
            }
        }

        get("/status") {
            val session = state.recordingSession
            if (session == null) {
                call.respond(RecordingStatusResponse(state = "idle", commandCount = 0, durationMs = 0))
                return@get
            }

            call.respond(
                RecordingStatusResponse(
                    state = when (session.state.value) {
                        is SessionState.Idle -> "idle"
                        is SessionState.Recording -> "recording"
                        is SessionState.Stopping -> "stopping"
                    },
                    commandCount = session.collectedCommands.size,
                    durationMs = session.durationMs
                )
            )
        }
    }

    // WebSocket for live recording events
    webSocket("/recording") {
        val session = state.recordingSession ?: run {
            close(CloseReason(CloseReason.Codes.NORMAL, "No recording in progress"))
            return@webSocket
        }

        session.commands.collect { command ->
            val msg = RecordingWsMessage(
                type = "command",
                command = command.toDto()
            )
            send(json.encodeToString(msg))
        }
    }
}

private fun MaestroCommand.toDto(): CommandDto = when (this) {
    is MaestroCommand.LaunchApp -> CommandDto(type = "LaunchApp")
    is MaestroCommand.TapOn -> CommandDto(
        type = "TapOn",
        selector = selector.toDto()
    )
    is MaestroCommand.InputText -> CommandDto(type = "InputText", text = text)
}

private fun TapOnSelector.toDto(): SelectorDto = when (this) {
    is TapOnSelector.ById -> SelectorDto(type = "ById", value = id)
    is TapOnSelector.ByText -> SelectorDto(type = "ByText", value = text)
    is TapOnSelector.ByContentDescription -> SelectorDto(type = "ByContentDescription", value = description)
    is TapOnSelector.ByPoint -> SelectorDto(type = "ByPoint", value = "$x,$y")
}

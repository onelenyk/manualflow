package com.maestrorecorder.dashboard.routes

import com.maestrorecorder.dashboard.model.ErrorResponse
import com.maestrorecorder.dashboard.model.RunStartResponse
import com.maestrorecorder.dashboard.model.RunWsMessage
import com.maestrorecorder.dashboard.session.DashboardState
import io.ktor.http.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

private val runProcesses = ConcurrentHashMap<String, Process>()

fun Route.runnerRoutes(state: DashboardState) {
    val json = Json { prettyPrint = false }

    post("/flows/{id}/run") {
        val flowId = call.parameters["id"]
            ?: return@post call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing flow ID"))

        val flowPath = System.getProperty("user.home") + "/.maestro-recorder/flows/$flowId.yaml"
        val file = java.io.File(flowPath)
        if (!file.exists()) {
            call.respond(HttpStatusCode.NotFound, ErrorResponse("Flow not found"))
            return@post
        }

        val runId = UUID.randomUUID().toString().take(8)
        call.respond(RunStartResponse(runId = runId))
    }

    post("/runs/{runId}/stop") {
        val runId = call.parameters["runId"] ?: return@post
        runProcesses[runId]?.destroy()
        runProcesses.remove(runId)
        call.respond(HttpStatusCode.NoContent)
    }

    webSocket("/run/{runId}") {
        val runId = call.parameters["runId"]
            ?: return@webSocket close(CloseReason(CloseReason.Codes.NORMAL, "Missing runId"))

        // For now, just run maestro test and stream output
        val flowPath = System.getProperty("user.home") + "/.maestro-recorder/flows/"

        try {
            val process = ProcessBuilder("maestro", "test", "$flowPath$runId.yaml")
                .redirectErrorStream(true)
                .start()
            runProcesses[runId] = process

            val reader = process.inputStream.bufferedReader()
            while (true) {
                val line = withContext(Dispatchers.IO) { reader.readLine() } ?: break
                val msg = RunWsMessage(type = "stdout", line = line)
                send(json.encodeToString(msg))
            }

            val exitCode = withContext(Dispatchers.IO) { process.waitFor() }
            send(json.encodeToString(RunWsMessage(type = "completed", exitCode = exitCode)))
        } catch (e: Exception) {
            send(json.encodeToString(RunWsMessage(type = "completed", exitCode = -1)))
        } finally {
            runProcesses.remove(runId)
        }
    }
}

package com.maestrorecorder.cli

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.main
import com.github.ajalt.clikt.core.subcommands
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.options.required
import com.maestrorecorder.cli.recorder.RecordingSession
import com.maestrorecorder.cli.recorder.SessionConfig
import kotlinx.coroutines.runBlocking
import java.nio.file.Path

class MaestroRecorderCli : CliktCommand(name = "maestro-recorder") {
    override fun run() = Unit
}

class RecordCommand : CliktCommand(name = "record") {
    private val output by option("-o", "--output", help = "Output YAML file path").required()
    private val appId by option("--app", help = "Target app package ID")
    private val device by option("-d", "--device", help = "ADB device serial")
    private val port by option("-p", "--port", help = "GRPC port (default: 50051)")

    override fun run() = runBlocking {
        val session = RecordingSession(
            SessionConfig(
                outputFile = Path.of(output),
                appId = appId,
                deviceSerial = device,
                grpcPort = port?.toIntOrNull() ?: 50051
            )
        )
        session.start()
    }
}

class DevicesCommand : CliktCommand(name = "devices") {
    override fun run() = runBlocking {
        val output = com.maestrorecorder.cli.adb.AdbBridge().exec("devices")
        echo(output)
    }
}

fun main(args: Array<String>) = MaestroRecorderCli()
    .subcommands(RecordCommand(), DevicesCommand())
    .main(args)

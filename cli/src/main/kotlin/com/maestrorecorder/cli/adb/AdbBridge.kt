package com.maestrorecorder.cli.adb

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import java.io.BufferedReader

class AdbBridge(private val adbPath: String = "adb") {

    suspend fun exec(vararg args: String): String = withContext(Dispatchers.IO) {
        val process = ProcessBuilder(adbPath, *args)
            .redirectErrorStream(true)
            .start()
        val output = process.inputStream.bufferedReader().readText()
        val exitCode = process.waitFor()
        if (exitCode != 0) {
            throw AdbException("adb ${args.joinToString(" ")} failed (exit $exitCode): $output")
        }
        output.trim()
    }

    fun stream(vararg args: String): Pair<Flow<String>, Process> {
        val process = ProcessBuilder(adbPath, *args)
            .redirectErrorStream(false)
            .start()

        val flow = callbackFlow {
            val reader: BufferedReader = process.inputStream.bufferedReader()
            try {
                withContext(Dispatchers.IO) {
                    var line = reader.readLine()
                    while (line != null && isActive) {
                        send(line)
                        line = reader.readLine()
                    }
                }
            } finally {
                channel.close()
            }
        }

        return flow to process
    }

    fun startProcess(vararg args: String): Process {
        return ProcessBuilder(adbPath, *args)
            .redirectErrorStream(true)
            .start()
    }
}

class AdbException(message: String) : RuntimeException(message)

package com.maestrorecorder.cli.recorder

import java.nio.file.Path

data class SessionConfig(
    val outputFile: Path,
    val appId: String? = null,
    val deviceSerial: String? = null,
    val grpcPort: Int = 50051
)

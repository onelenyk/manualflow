package com.maestrorecorder.cli.parser

data class GeteventLine(
    val timestampSec: Double,
    val device: String,
    val type: String,
    val code: String,
    val value: String
) {
    companion object {
        private val LINE_REGEX = Regex(
            """\[\s*(\d+\.\d+)]\s+(/dev/input/event\d+):\s+(\S+)\s+(\S+)\s+(\S+)"""
        )

        fun parse(line: String): GeteventLine? {
            val match = LINE_REGEX.find(line) ?: return null
            val (timestamp, device, type, code, value) = match.destructured
            return GeteventLine(
                timestampSec = timestamp.toDoubleOrNull() ?: return null,
                device = device,
                type = type,
                code = code,
                value = value
            )
        }
    }
}

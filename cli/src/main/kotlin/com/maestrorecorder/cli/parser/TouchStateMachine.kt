package com.maestrorecorder.cli.parser

import com.maestrorecorder.shared.models.UserAction
import kotlin.math.sqrt

class TouchStateMachine {

    companion object {
        const val TAP_MAX_DURATION_MS = 200.0
        const val TAP_MAX_DISTANCE_PX = 20.0
    }

    private enum class State {
        IDLE,
        TOUCH_ACTIVE
    }

    private var state = State.IDLE
    private var downTimestamp = 0.0
    private var currentRawX = 0
    private var currentRawY = 0
    private var startRawX = 0
    private var startRawY = 0
    private var minRawX = Int.MAX_VALUE
    private var maxRawX = Int.MIN_VALUE
    private var minRawY = Int.MAX_VALUE
    private var maxRawY = Int.MIN_VALUE

    fun feed(line: GeteventLine, converter: CoordinateConverter): UserAction? {
        return when (line.type) {
            "EV_ABS" -> handleAbs(line)
            "EV_KEY" -> handleKey(line, converter)
            else -> null
        }
    }

    private fun handleAbs(line: GeteventLine): UserAction? {
        when (line.code) {
            "ABS_MT_POSITION_X" -> {
                val rawX = parseHexValue(line.value)
                currentRawX = rawX
                if (state == State.TOUCH_ACTIVE) {
                    minRawX = minOf(minRawX, rawX)
                    maxRawX = maxOf(maxRawX, rawX)
                }
            }
            "ABS_MT_POSITION_Y" -> {
                val rawY = parseHexValue(line.value)
                currentRawY = rawY
                if (state == State.TOUCH_ACTIVE) {
                    minRawY = minOf(minRawY, rawY)
                    maxRawY = maxOf(maxRawY, rawY)
                }
            }
        }
        return null
    }

    private fun handleKey(line: GeteventLine, converter: CoordinateConverter): UserAction? {
        if (line.code != "BTN_TOUCH") return null

        return when (line.value) {
            "DOWN" -> {
                state = State.TOUCH_ACTIVE
                downTimestamp = line.timestampSec
                startRawX = currentRawX
                startRawY = currentRawY
                minRawX = currentRawX
                maxRawX = currentRawX
                minRawY = currentRawY
                maxRawY = currentRawY
                null
            }
            "UP" -> {
                if (state != State.TOUCH_ACTIVE) {
                    state = State.IDLE
                    return null
                }

                val durationMs = (line.timestampSec - downTimestamp) * 1000.0

                val pixelStartX = converter.toPixelX(startRawX)
                val pixelStartY = converter.toPixelY(startRawY)
                val pixelEndX = converter.toPixelX(currentRawX)
                val pixelEndY = converter.toPixelY(currentRawY)

                val dx = (pixelEndX - pixelStartX).toDouble()
                val dy = (pixelEndY - pixelStartY).toDouble()
                val distance = sqrt(dx * dx + dy * dy)

                state = State.IDLE

                if (durationMs <= TAP_MAX_DURATION_MS && distance <= TAP_MAX_DISTANCE_PX) {
                    UserAction.Tap(
                        x = pixelStartX,
                        y = pixelStartY,
                        timestampMs = (downTimestamp * 1000).toLong()
                    )
                } else {
                    null // swipe or long press — Phase 2
                }
            }
            else -> null
        }
    }

    private fun parseHexValue(value: String): Int {
        return value.removePrefix("0x").toIntOrNull(16)
            ?: value.toIntOrNull()
            ?: 0
    }
}

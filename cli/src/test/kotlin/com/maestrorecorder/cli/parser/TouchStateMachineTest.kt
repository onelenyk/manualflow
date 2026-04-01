package com.maestrorecorder.cli.parser

import com.maestrorecorder.shared.models.UserAction
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

class TouchStateMachineTest {

    private val converter = CoordinateConverter(
        inputMaxX = 32767,
        inputMaxY = 32767,
        screenWidth = 1080,
        screenHeight = 2400
    )

    private fun line(timestamp: Double, type: String, code: String, value: String) =
        GeteventLine(timestamp, "/dev/input/event2", type, code, value)

    @Test
    fun `detects simple tap`() {
        val sm = TouchStateMachine()

        // Position first
        assertNull(sm.feed(line(10.000, "EV_ABS", "ABS_MT_POSITION_X", "00004000"), converter))
        assertNull(sm.feed(line(10.000, "EV_ABS", "ABS_MT_POSITION_Y", "00004000"), converter))
        // Touch down
        assertNull(sm.feed(line(10.000, "EV_KEY", "BTN_TOUCH", "DOWN"), converter))
        // Touch up within 200ms
        val action = sm.feed(line(10.100, "EV_KEY", "BTN_TOUCH", "UP"), converter)

        assertIs<UserAction.Tap>(action)
        assertEquals(540, action.x) // 0x4000 = 16384 -> ~540px
        assertEquals(1200, action.y)
        assertEquals(10000L, action.timestampMs)
    }

    @Test
    fun `rejects long press (duration greater than 200ms)`() {
        val sm = TouchStateMachine()

        assertNull(sm.feed(line(10.000, "EV_ABS", "ABS_MT_POSITION_X", "00004000"), converter))
        assertNull(sm.feed(line(10.000, "EV_ABS", "ABS_MT_POSITION_Y", "00004000"), converter))
        assertNull(sm.feed(line(10.000, "EV_KEY", "BTN_TOUCH", "DOWN"), converter))
        // 600ms later — long press
        val action = sm.feed(line(10.600, "EV_KEY", "BTN_TOUCH", "UP"), converter)

        assertNull(action)
    }

    @Test
    fun `rejects swipe (too much movement)`() {
        val sm = TouchStateMachine()

        // Start position
        assertNull(sm.feed(line(10.000, "EV_ABS", "ABS_MT_POSITION_X", "00001000"), converter))
        assertNull(sm.feed(line(10.000, "EV_ABS", "ABS_MT_POSITION_Y", "00004000"), converter))
        assertNull(sm.feed(line(10.000, "EV_KEY", "BTN_TOUCH", "DOWN"), converter))

        // Move significantly
        assertNull(sm.feed(line(10.050, "EV_ABS", "ABS_MT_POSITION_X", "00007000"), converter))
        assertNull(sm.feed(line(10.050, "EV_ABS", "ABS_MT_POSITION_Y", "00004000"), converter))

        // Release within time, but moved too far
        val action = sm.feed(line(10.100, "EV_KEY", "BTN_TOUCH", "UP"), converter)
        assertNull(action)
    }

    @Test
    fun `handles multiple taps in sequence`() {
        val sm = TouchStateMachine()

        // First tap
        sm.feed(line(10.000, "EV_ABS", "ABS_MT_POSITION_X", "00002000"), converter)
        sm.feed(line(10.000, "EV_ABS", "ABS_MT_POSITION_Y", "00002000"), converter)
        sm.feed(line(10.000, "EV_KEY", "BTN_TOUCH", "DOWN"), converter)
        val tap1 = sm.feed(line(10.050, "EV_KEY", "BTN_TOUCH", "UP"), converter)
        assertIs<UserAction.Tap>(tap1)

        // Second tap at different position
        sm.feed(line(10.500, "EV_ABS", "ABS_MT_POSITION_X", "00006000"), converter)
        sm.feed(line(10.500, "EV_ABS", "ABS_MT_POSITION_Y", "00006000"), converter)
        sm.feed(line(10.500, "EV_KEY", "BTN_TOUCH", "DOWN"), converter)
        val tap2 = sm.feed(line(10.550, "EV_KEY", "BTN_TOUCH", "UP"), converter)
        assertIs<UserAction.Tap>(tap2)

        // Verify different coordinates
        assert(tap1.x != tap2.x || tap1.y != tap2.y)
    }

    @Test
    fun `ignores non-touch key events`() {
        val sm = TouchStateMachine()
        assertNull(sm.feed(line(10.000, "EV_KEY", "KEY_POWER", "DOWN"), converter))
        assertNull(sm.feed(line(10.100, "EV_KEY", "KEY_POWER", "UP"), converter))
    }

    @Test
    fun `handles UP without DOWN gracefully`() {
        val sm = TouchStateMachine()
        assertNull(sm.feed(line(10.000, "EV_KEY", "BTN_TOUCH", "UP"), converter))
    }
}

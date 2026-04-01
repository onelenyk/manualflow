package com.maestrorecorder.cli.parser

import com.maestrorecorder.shared.models.UserAction
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class GeteventParserTest {

    private val converter = CoordinateConverter(
        inputMaxX = 32767,
        inputMaxY = 32767,
        screenWidth = 1080,
        screenHeight = 2400
    )

    @Test
    fun `parses simple tap from raw getevent lines`() = runTest {
        val lines = flowOf(
            "[  1234.000000] /dev/input/event2: EV_ABS  ABS_MT_POSITION_X   00004000",
            "[  1234.000000] /dev/input/event2: EV_ABS  ABS_MT_POSITION_Y   00004000",
            "[  1234.000000] /dev/input/event2: EV_KEY  BTN_TOUCH           DOWN",
            "[  1234.000000] /dev/input/event2: EV_SYN  SYN_REPORT          00000000",
            "[  1234.050000] /dev/input/event2: EV_KEY  BTN_TOUCH           UP",
            "[  1234.050000] /dev/input/event2: EV_SYN  SYN_REPORT          00000000"
        )

        val parser = GeteventParser(converter, deviceFilter = "/dev/input/event2")
        val actions = parser.parse(lines).toList()

        assertEquals(1, actions.size)
        assertIs<UserAction.Tap>(actions[0])
    }

    @Test
    fun `parses three taps in sequence`() = runTest {
        val lines = flowOf(
            // Tap 1
            "[  10.000] /dev/input/event2: EV_ABS  ABS_MT_POSITION_X   00002000",
            "[  10.000] /dev/input/event2: EV_ABS  ABS_MT_POSITION_Y   00002000",
            "[  10.000] /dev/input/event2: EV_KEY  BTN_TOUCH           DOWN",
            "[  10.000] /dev/input/event2: EV_SYN  SYN_REPORT          00000000",
            "[  10.050] /dev/input/event2: EV_KEY  BTN_TOUCH           UP",
            "[  10.050] /dev/input/event2: EV_SYN  SYN_REPORT          00000000",
            // Tap 2
            "[  10.500] /dev/input/event2: EV_ABS  ABS_MT_POSITION_X   00004000",
            "[  10.500] /dev/input/event2: EV_ABS  ABS_MT_POSITION_Y   00004000",
            "[  10.500] /dev/input/event2: EV_KEY  BTN_TOUCH           DOWN",
            "[  10.500] /dev/input/event2: EV_SYN  SYN_REPORT          00000000",
            "[  10.550] /dev/input/event2: EV_KEY  BTN_TOUCH           UP",
            "[  10.550] /dev/input/event2: EV_SYN  SYN_REPORT          00000000",
            // Tap 3
            "[  11.000] /dev/input/event2: EV_ABS  ABS_MT_POSITION_X   00006000",
            "[  11.000] /dev/input/event2: EV_ABS  ABS_MT_POSITION_Y   00006000",
            "[  11.000] /dev/input/event2: EV_KEY  BTN_TOUCH           DOWN",
            "[  11.000] /dev/input/event2: EV_SYN  SYN_REPORT          00000000",
            "[  11.050] /dev/input/event2: EV_KEY  BTN_TOUCH           UP",
            "[  11.050] /dev/input/event2: EV_SYN  SYN_REPORT          00000000"
        )

        val parser = GeteventParser(converter, deviceFilter = "/dev/input/event2")
        val actions = parser.parse(lines).toList()

        assertEquals(3, actions.size)
        actions.forEach { assertIs<UserAction.Tap>(it) }
    }

    @Test
    fun `ignores swipe`() = runTest {
        val lines = flowOf(
            "[  10.000] /dev/input/event2: EV_ABS  ABS_MT_POSITION_X   00001000",
            "[  10.000] /dev/input/event2: EV_ABS  ABS_MT_POSITION_Y   00004000",
            "[  10.000] /dev/input/event2: EV_KEY  BTN_TOUCH           DOWN",
            "[  10.000] /dev/input/event2: EV_SYN  SYN_REPORT          00000000",
            "[  10.050] /dev/input/event2: EV_ABS  ABS_MT_POSITION_X   00007000",
            "[  10.050] /dev/input/event2: EV_SYN  SYN_REPORT          00000000",
            "[  10.100] /dev/input/event2: EV_KEY  BTN_TOUCH           UP",
            "[  10.100] /dev/input/event2: EV_SYN  SYN_REPORT          00000000"
        )

        val parser = GeteventParser(converter, deviceFilter = "/dev/input/event2")
        val actions = parser.parse(lines).toList()

        assertTrue(actions.isEmpty())
    }

    @Test
    fun `ignores malformed lines`() = runTest {
        val lines = flowOf(
            "add device 1: /dev/input/event2",
            "  name: \"touchscreen\"",
            "",
            "garbage",
            "[  10.000] /dev/input/event2: EV_ABS  ABS_MT_POSITION_X   00004000",
            "[  10.000] /dev/input/event2: EV_ABS  ABS_MT_POSITION_Y   00004000",
            "[  10.000] /dev/input/event2: EV_KEY  BTN_TOUCH           DOWN",
            "[  10.050] /dev/input/event2: EV_KEY  BTN_TOUCH           UP"
        )

        val parser = GeteventParser(converter, deviceFilter = "/dev/input/event2")
        val actions = parser.parse(lines).toList()

        assertEquals(1, actions.size)
        assertIs<UserAction.Tap>(actions[0])
    }

    @Test
    fun `filters by device`() = runTest {
        val lines = flowOf(
            "[  10.000] /dev/input/event0: EV_ABS  ABS_MT_POSITION_X   00004000",
            "[  10.000] /dev/input/event0: EV_ABS  ABS_MT_POSITION_Y   00004000",
            "[  10.000] /dev/input/event0: EV_KEY  BTN_TOUCH           DOWN",
            "[  10.050] /dev/input/event0: EV_KEY  BTN_TOUCH           UP"
        )

        val parser = GeteventParser(converter, deviceFilter = "/dev/input/event2")
        val actions = parser.parse(lines).toList()

        assertTrue(actions.isEmpty())
    }
}

package com.maestrorecorder.cli.parser

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class GeteventLineTest {

    @Test
    fun `parses standard getevent line`() {
        val line = "[  1234.567890] /dev/input/event2: EV_ABS  ABS_MT_POSITION_X   00000218"
        val parsed = GeteventLine.parse(line)
        assertNotNull(parsed)
        assertEquals(1234.567890, parsed.timestampSec, 0.000001)
        assertEquals("/dev/input/event2", parsed.device)
        assertEquals("EV_ABS", parsed.type)
        assertEquals("ABS_MT_POSITION_X", parsed.code)
        assertEquals("00000218", parsed.value)
    }

    @Test
    fun `parses BTN_TOUCH DOWN`() {
        val line = "[  1234.567890] /dev/input/event2: EV_KEY  BTN_TOUCH           DOWN"
        val parsed = GeteventLine.parse(line)
        assertNotNull(parsed)
        assertEquals("EV_KEY", parsed.type)
        assertEquals("BTN_TOUCH", parsed.code)
        assertEquals("DOWN", parsed.value)
    }

    @Test
    fun `parses SYN_REPORT`() {
        val line = "[  1234.567890] /dev/input/event2: EV_SYN  SYN_REPORT          00000000"
        val parsed = GeteventLine.parse(line)
        assertNotNull(parsed)
        assertEquals("EV_SYN", parsed.type)
        assertEquals("SYN_REPORT", parsed.code)
    }

    @Test
    fun `returns null for malformed input`() {
        assertNull(GeteventLine.parse(""))
        assertNull(GeteventLine.parse("garbage data"))
        assertNull(GeteventLine.parse("add device 1: /dev/input/event2"))
        assertNull(GeteventLine.parse("  name: \"touchscreen\""))
    }

    @Test
    fun `handles various timestamp formats`() {
        val line = "[     0.000100] /dev/input/event0: EV_ABS  ABS_MT_POSITION_X   00000000"
        val parsed = GeteventLine.parse(line)
        assertNotNull(parsed)
        assertEquals(0.000100, parsed.timestampSec, 0.000001)
    }
}

package com.maestrorecorder.cli.adb

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals

class InputDeviceDiscoveryTest {

    @Test
    fun `parses Pixel emulator getevent output`() {
        val output = """
            add device 1: /dev/input/event0
              name:     "Power Button"
              events:
                KEY (0001): KEY_POWER
            add device 2: /dev/input/event1
              name:     "gpio-keys"
              events:
                KEY (0001): KEY_VOLUMEDOWN KEY_VOLUMEUP
            add device 3: /dev/input/event2
              name:     "virtio_input_multi_touch_11"
              events:
                ABS (0003): ABS_MT_SLOT         : value 0, min 0, max 9, fuzz 0, flat 0, resolution 0
                            ABS_MT_TOUCH_MAJOR  : value 0, min 0, max 255, fuzz 0, flat 0, resolution 0
                            ABS_MT_POSITION_X   : value 0, min 0, max 32767, fuzz 0, flat 0, resolution 0
                            ABS_MT_POSITION_Y   : value 0, min 0, max 32767, fuzz 0, flat 0, resolution 0
                            ABS_MT_TRACKING_ID  : value 0, min 0, max 65535, fuzz 0, flat 0, resolution 0
        """.trimIndent()

        val result = InputDeviceDiscovery.parseGeteventLp(output)
        assertEquals("/dev/input/event2", result.devicePath)
        assertEquals(32767, result.maxX)
        assertEquals(32767, result.maxY)
    }

    @Test
    fun `parses device with 4095 range`() {
        val output = """
            add device 1: /dev/input/event3
              name:     "sec_touchscreen"
              events:
                ABS (0003): ABS_MT_POSITION_X   : value 0, min 0, max 4095, fuzz 0, flat 0, resolution 0
                            ABS_MT_POSITION_Y   : value 0, min 0, max 4095, fuzz 0, flat 0, resolution 0
        """.trimIndent()

        val result = InputDeviceDiscovery.parseGeteventLp(output)
        assertEquals("/dev/input/event3", result.devicePath)
        assertEquals(4095, result.maxX)
        assertEquals(4095, result.maxY)
    }

    @Test
    fun `finds touchscreen among multiple devices`() {
        val output = """
            add device 1: /dev/input/event0
              name:     "Power Button"
              events:
                KEY (0001): KEY_POWER
            add device 2: /dev/input/event1
              name:     "touchscreen"
              events:
                ABS (0003): ABS_MT_POSITION_X   : value 0, min 0, max 1079, fuzz 0, flat 0, resolution 0
                            ABS_MT_POSITION_Y   : value 0, min 0, max 2399, fuzz 0, flat 0, resolution 0
            add device 3: /dev/input/event2
              name:     "accelerometer"
              events:
                ABS (0003): ABS_X : value 0, min -32768, max 32767
        """.trimIndent()

        val result = InputDeviceDiscovery.parseGeteventLp(output)
        assertEquals("/dev/input/event1", result.devicePath)
        assertEquals(1079, result.maxX)
        assertEquals(2399, result.maxY)
    }

    @Test
    fun `throws when no touchscreen found`() {
        val output = """
            add device 1: /dev/input/event0
              name:     "Power Button"
              events:
                KEY (0001): KEY_POWER
        """.trimIndent()

        assertThrows<AdbException> {
            InputDeviceDiscovery.parseGeteventLp(output)
        }
    }
}

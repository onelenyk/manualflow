package com.maestrorecorder.cli.parser

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class CoordinateConverterTest {

    @Test
    fun `converts raw coordinates to pixel coordinates`() {
        val converter = CoordinateConverter(
            inputMaxX = 32767,
            inputMaxY = 32767,
            screenWidth = 1080,
            screenHeight = 2400
        )
        // Near center: 16383/32767 ≈ 0.49998
        assertEquals(539, converter.toPixelX(16383))
        assertEquals(1199, converter.toPixelY(16383))
    }

    @Test
    fun `handles zero coordinates`() {
        val converter = CoordinateConverter(
            inputMaxX = 4095,
            inputMaxY = 4095,
            screenWidth = 1080,
            screenHeight = 2400
        )
        assertEquals(0, converter.toPixelX(0))
        assertEquals(0, converter.toPixelY(0))
    }

    @Test
    fun `handles max coordinates`() {
        val converter = CoordinateConverter(
            inputMaxX = 4095,
            inputMaxY = 4095,
            screenWidth = 1080,
            screenHeight = 2400
        )
        assertEquals(1080, converter.toPixelX(4095))
        assertEquals(2400, converter.toPixelY(4095))
    }

    @Test
    fun `converts with 4095 input range`() {
        val converter = CoordinateConverter(
            inputMaxX = 4095,
            inputMaxY = 4095,
            screenWidth = 1080,
            screenHeight = 2400
        )
        // 0x218 = 536 -> (536 * 1080) / 4095 ≈ 141
        assertEquals(141, converter.toPixelX(536))
    }
}

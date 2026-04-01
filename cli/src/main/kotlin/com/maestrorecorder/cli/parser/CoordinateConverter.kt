package com.maestrorecorder.cli.parser

class CoordinateConverter(
    private val inputMaxX: Int,
    private val inputMaxY: Int,
    private val screenWidth: Int,
    private val screenHeight: Int
) {
    fun toPixelX(rawX: Int): Int =
        (rawX.toLong() * screenWidth / inputMaxX).toInt()

    fun toPixelY(rawY: Int): Int =
        (rawY.toLong() * screenHeight / inputMaxY).toInt()
}

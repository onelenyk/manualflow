package com.maestrorecorder.cli.parser

import com.maestrorecorder.shared.models.UserAction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

class GeteventParser(
    private val converter: CoordinateConverter,
    private val deviceFilter: String? = null
) {
    fun parse(lines: Flow<String>): Flow<UserAction> = flow {
        val stateMachine = TouchStateMachine()

        lines.collect { line ->
            val parsed = GeteventLine.parse(line) ?: return@collect

            if (deviceFilter != null && parsed.device != deviceFilter) return@collect

            val action = stateMachine.feed(parsed, converter)
            if (action != null) {
                emit(action)
            }
        }
    }
}

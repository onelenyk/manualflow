package com.maestrorecorder.cli.generator

import com.maestrorecorder.shared.models.MaestroCommand

object PostProcessor {

    fun process(commands: List<MaestroCommand>): List<MaestroCommand> {
        return deduplicateTaps(commands)
    }

    private fun deduplicateTaps(commands: List<MaestroCommand>): List<MaestroCommand> {
        if (commands.size < 2) return commands

        val result = mutableListOf(commands.first())

        for (i in 1 until commands.size) {
            val prev = result.last()
            val curr = commands[i]

            // Skip consecutive duplicate TapOn commands
            if (prev is MaestroCommand.TapOn && curr is MaestroCommand.TapOn &&
                prev.selector == curr.selector
            ) {
                continue
            }

            result.add(curr)
        }

        return result
    }
}

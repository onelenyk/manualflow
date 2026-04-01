package com.maestrorecorder.dashboard.storage

import com.maestrorecorder.dashboard.model.FlowDetailDto
import com.maestrorecorder.dashboard.model.FlowDto
import java.io.File
import java.nio.file.Files
import java.nio.file.attribute.BasicFileAttributes

class FlowStorage(
    private val baseDir: String = System.getProperty("user.home") + "/.maestro-recorder/flows"
) {
    init {
        File(baseDir).mkdirs()
    }

    fun listFlows(): List<FlowDto> {
        val dir = File(baseDir)
        if (!dir.exists()) return emptyList()

        return dir.listFiles { f -> f.extension == "yaml" || f.extension == "yml" }
            ?.map { file ->
                val attrs = Files.readAttributes(file.toPath(), BasicFileAttributes::class.java)
                FlowDto(
                    id = file.nameWithoutExtension,
                    name = file.nameWithoutExtension,
                    commandCount = file.readLines().count { it.trimStart().startsWith("- ") },
                    createdAt = attrs.creationTime().toMillis()
                )
            }
            ?.sortedByDescending { it.createdAt }
            ?: emptyList()
    }

    fun getFlow(id: String): FlowDetailDto? {
        val file = File(baseDir, "$id.yaml")
        if (!file.exists()) return null

        return FlowDetailDto(
            id = id,
            name = file.nameWithoutExtension,
            yaml = file.readText(),
            commands = emptyList() // Parsing done on client side
        )
    }

    fun saveFlow(name: String, yaml: String): FlowDto {
        val slug = name.lowercase()
            .replace(Regex("[^a-z0-9]+"), "-")
            .trim('-')
        val file = File(baseDir, "$slug.yaml")
        file.writeText(yaml)

        return FlowDto(
            id = slug,
            name = name,
            commandCount = yaml.lines().count { it.trimStart().startsWith("- ") },
            createdAt = System.currentTimeMillis()
        )
    }

    fun updateFlow(id: String, name: String?, yaml: String?): FlowDto? {
        val file = File(baseDir, "$id.yaml")
        if (!file.exists()) return null

        if (yaml != null) {
            file.writeText(yaml)
        }

        val finalName = name ?: id
        if (name != null && name != id) {
            val newSlug = name.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-')
            val newFile = File(baseDir, "$newSlug.yaml")
            file.renameTo(newFile)
            return FlowDto(
                id = newSlug,
                name = name,
                commandCount = (yaml ?: newFile.readText()).lines().count { it.trimStart().startsWith("- ") },
                createdAt = System.currentTimeMillis()
            )
        }

        return FlowDto(
            id = id,
            name = finalName,
            commandCount = file.readLines().count { it.trimStart().startsWith("- ") },
            createdAt = System.currentTimeMillis()
        )
    }

    fun deleteFlow(id: String) {
        File(baseDir, "$id.yaml").delete()
    }
}

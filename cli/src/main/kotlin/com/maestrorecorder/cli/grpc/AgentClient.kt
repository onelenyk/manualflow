package com.maestrorecorder.cli.grpc

import com.maestrorecorder.shared.converters.toDomain
import com.maestrorecorder.shared.models.DeviceInfo
import com.maestrorecorder.shared.models.UiElement
import com.maestrorecorder.shared.proto.Coordinates
import com.maestrorecorder.shared.proto.Empty
import com.maestrorecorder.shared.proto.RecorderAgentGrpcKt
import io.grpc.ManagedChannel
import io.grpc.ManagedChannelBuilder
import java.io.Closeable
import java.util.concurrent.TimeUnit

class AgentClient(
    host: String = "localhost",
    port: Int = 50051
) : Closeable {

    private val channel: ManagedChannel = ManagedChannelBuilder
        .forAddress(host, port)
        .usePlaintext()
        .build()

    private val stub = RecorderAgentGrpcKt.RecorderAgentCoroutineStub(channel)

    suspend fun getElementAt(x: Int, y: Int): UiElement {
        val response = stub.getElementAt(
            Coordinates.newBuilder()
                .setX(x)
                .setY(y)
                .build()
        )
        return response.toDomain()
    }

    suspend fun getDeviceInfo(): DeviceInfo {
        val response = stub.getDeviceInfo(Empty.getDefaultInstance())
        return response.toDomain()
    }

    override fun close() {
        channel.shutdown().awaitTermination(5, TimeUnit.SECONDS)
    }
}

import { useRef, useCallback, useEffect, useState } from 'react';
import { useBinaryWebSocketWithControl } from '../../api/websocket';
import { useDeviceStore } from '../../stores/deviceStore';

interface ScreenMirrorProps {
  onTap?: (x: number, y: number) => void;
}

interface DeviceInfo {
  device: string;
  width: number;
  height: number;
}

const CHANNEL_VIDEO = 0;
const CHANNEL_CONTROL = 1;

export function ScreenMirror({ onTap }: ScreenMirrorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoDecoderRef = useRef<VideoDecoder | null>(null);
  const { selectedDevice } = useDeviceStore();
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [decoderError, setDecoderError] = useState<string | null>(null);
  const activePointersRef = useRef<Set<number>>(new Set());
  const gotDeviceInfoRef = useRef(false);
  const pendingBufferRef = useRef<Uint8Array>(new Uint8Array(0));
  const configuredRef = useRef(false);
  const timestampRef = useRef(0);

  // Reset all state when device changes
  const prevDeviceRef = useRef(selectedDevice);
  if (prevDeviceRef.current !== selectedDevice) {
    prevDeviceRef.current = selectedDevice;
    gotDeviceInfoRef.current = false;
    pendingBufferRef.current = new Uint8Array(0);
    configuredRef.current = false;
    timestampRef.current = 0;
  }

  // Initialize VideoDecoder once
  useEffect(() => {
    if (!('VideoDecoder' in window)) {
      setDecoderError('WebCodecs API not supported');
      return;
    }

    const decoder = new VideoDecoder({
      output: (frame: VideoFrame) => {
        const canvas = canvasRef.current;
        if (!canvas) {
          frame.close();
          return;
        }

        canvas.width = frame.codedWidth;
        canvas.height = frame.codedHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(frame, 0, 0);
        }
        frame.close();
      },
      error: (error: DOMException) => {
        console.error('VideoDecoder error:', error);
        setDecoderError(error.message);
      },
    });

    videoDecoderRef.current = decoder;

    return () => {
      if (decoder.state !== 'closed') {
        decoder.close();
      }
    };
  }, []);

  const { sendBinary } = useBinaryWebSocketWithControl(
    '/ws/mirror',
    (data: ArrayBuffer | string) => {
      // First message per connection is device info JSON (text)
      if (!gotDeviceInfoRef.current) {
        try {
          let text: string;
          if (typeof data === 'string') {
            text = data;
          } else {
            text = new TextDecoder().decode(data);
          }
          const info = JSON.parse(text);
          setDeviceInfo(info);
          setIsConnected(true);
          gotDeviceInfoRef.current = true;
        } catch (e) {
          console.error('Failed to parse device info:', e);
        }
        return;
      }

      // After device info, expect binary data with channel headers
      if (!(data instanceof ArrayBuffer)) {
        return;
      }

      // Parse channel header (4-byte Int32BE)
      if (data.byteLength < 4) return;

      const view = new DataView(data);
      const channel = view.getInt32(0, false); // big-endian
      const payload = data.slice(4);

      if (channel === CHANNEL_VIDEO && videoDecoderRef.current) {
        // H.264 video data - try to decode
        processVideoData(payload);
      }
    },
    !!selectedDevice
  );

  const processVideoData = (data: ArrayBuffer) => {
    const decoder = videoDecoderRef.current;
    if (!decoder || decoder.state === 'closed') return;

    // Accumulate incoming data
    const incoming = new Uint8Array(data);
    const prev = pendingBufferRef.current;
    const combined = new Uint8Array(prev.length + incoming.length);
    combined.set(prev);
    combined.set(incoming, prev.length);
    pendingBufferRef.current = combined;

    // Process complete frames from the buffer
    // scrcpy send_frame_meta format: 8-byte PTS (big-endian) + 4-byte packet size + packet data
    while (pendingBufferRef.current.length >= 12) {
      const buf = pendingBufferRef.current;
      const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

      const packetSize = view.getUint32(8, false); // bytes 8-11 = packet size (big-endian)
      const totalSize = 12 + packetSize;

      if (buf.length < totalSize) break; // wait for more data

      const packet = buf.slice(12, totalSize);
      pendingBufferRef.current = buf.slice(totalSize);

      try {
        // Parse NAL units to find SPS, PPS, IDR
        const nalUnits = parseNalUnits(packet);
        const hasSPS = nalUnits.some(n => n.type === 7);
        const hasIDR = nalUnits.some(n => n.type === 5);
        const isKeyFrame = hasSPS || hasIDR;

        // Configure decoder when we first see SPS+PPS
        if (!configuredRef.current && hasSPS) {
          const sps = nalUnits.find(n => n.type === 7);
          if (sps && sps.data.length > 3) {
            const profile = sps.data[1];
            const compat = sps.data[2];
            const level = sps.data[3];
            const codec = `avc1.${profile.toString(16).padStart(2, '0')}${compat.toString(16).padStart(2, '0')}${level.toString(16).padStart(2, '0')}`;

            // Build AVC decoder config record (avcC box) from SPS+PPS
            const pps = nalUnits.find(n => n.type === 8);
            if (pps) {
              const description = buildAvcC(sps.data, pps.data);
              decoder.configure({
                codec,
                description,
                optimizeForLatency: true,
              });
              configuredRef.current = true;
            }
          }
        }

        if (!configuredRef.current) continue;

        const chunk = new EncodedVideoChunk({
          type: isKeyFrame ? 'key' : 'delta',
          timestamp: timestampRef.current,
          data: packet,
        });
        timestampRef.current += 33333;

        decoder.decode(chunk);
      } catch (e) {
        console.error('Decode error:', e);
      }
    }
  };

  const sendTouchEvent = useCallback(
    (action: 0 | 1 | 2, x: number, y: number, pointerId: number = 0) => {
      if (!deviceInfo) return;

      // Binary touch format:
      // 1 byte: type=2 (touch)
      // 1 byte: action (0=DOWN, 1=UP, 2=MOVE)
      // 8 bytes: pointerId (BigInt64BE)
      // 4 bytes: x (Int32BE)
      // 4 bytes: y (Int32BE)
      // 2 bytes: screenWidth (UInt16BE)
      // 2 bytes: screenHeight (UInt16BE)
      // 2 bytes: pressure (UInt16BE, 0xFFFF = full pressure)
      // 4 bytes: actionButton (Int32BE)
      // 4 bytes: buttons (Int32BE)

      const buffer = new ArrayBuffer(4 + 1 + 1 + 8 + 4 + 4 + 2 + 2 + 2 + 4 + 4);
      const dv = new DataView(buffer);
      let offset = 0;

      // Channel header
      dv.setInt32(offset, CHANNEL_CONTROL, false); // big-endian
      offset += 4;

      // Type (touch)
      dv.setUint8(offset, 2);
      offset += 1;

      // Action
      dv.setUint8(offset, action);
      offset += 1;

      // Pointer ID (as BigInt64)
      dv.setBigInt64(offset, BigInt(pointerId), false);
      offset += 8;

      // X coordinate
      dv.setInt32(offset, x, false);
      offset += 4;

      // Y coordinate
      dv.setInt32(offset, y, false);
      offset += 4;

      // Screen width
      dv.setUint16(offset, deviceInfo.width, false);
      offset += 2;

      // Screen height
      dv.setUint16(offset, deviceInfo.height, false);
      offset += 2;

      // Pressure (full pressure)
      dv.setUint16(offset, 0xffff, false);
      offset += 2;

      // Action button
      dv.setInt32(offset, 1, false);
      offset += 4;

      // Buttons
      dv.setInt32(offset, action === 0 ? 1 : 0, false);

      sendBinary(buffer);
    },
    [deviceInfo, sendBinary]
  );

  const handleCanvasEvent = useCallback(
    (
      e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
      eventType: 'down' | 'move' | 'up'
    ) => {
      if (!canvasRef.current || !deviceInfo) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      // Get coordinates
      let clientX = 0;
      let clientY = 0;

      if ('touches' in e) {
        if (e.touches.length === 0) return;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const x = Math.round((clientX - rect.left) * scaleX);
      const y = Math.round((clientY - rect.top) * scaleY);

      // Clamp to device bounds
      const clampedX = Math.max(0, Math.min(x, deviceInfo.width - 1));
      const clampedY = Math.max(0, Math.min(y, deviceInfo.height - 1));

      const pointerId = 0;

      if (eventType === 'down') {
        activePointersRef.current.add(pointerId);
        sendTouchEvent(0, clampedX, clampedY, pointerId);
        onTap?.(clampedX, clampedY);
      } else if (eventType === 'move' && activePointersRef.current.has(pointerId)) {
        sendTouchEvent(2, clampedX, clampedY, pointerId);
      } else if (eventType === 'up') {
        activePointersRef.current.delete(pointerId);
        sendTouchEvent(1, clampedX, clampedY, pointerId);
      }

      e.preventDefault();
    },
    [deviceInfo, sendTouchEvent, onTap]
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    handleCanvasEvent(e, 'down');
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    handleCanvasEvent(e, 'move');
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    handleCanvasEvent(e, 'up');
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    handleCanvasEvent(e, 'down');
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    handleCanvasEvent(e, 'move');
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    handleCanvasEvent(e, 'up');
  };

  if (!selectedDevice) {
    return (
      <div className="w-full h-64 bg-slate-800 rounded-lg flex items-center justify-center text-slate-500 text-sm">
        No device connected
      </div>
    );
  }

  if (decoderError) {
    return (
      <div className="w-full h-64 bg-slate-800 rounded-lg flex items-center justify-center text-red-500 text-sm">
        Decoder error: {decoderError}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 w-full items-center">
      {!isConnected && (
        <div className="text-xs text-slate-500">Connecting to device...</div>
      )}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="max-h-[500px] w-auto rounded-lg border border-slate-700 cursor-crosshair bg-slate-800"
        style={{ maxWidth: '100%', objectFit: 'contain', touchAction: 'none' }}
      />
    </div>
  );
}

// Parse Annex B NAL units from a byte stream
function parseNalUnits(data: Uint8Array): { type: number; data: Uint8Array }[] {
  const units: { type: number; data: Uint8Array }[] = [];
  let i = 0;

  while (i < data.length - 4) {
    // Find start code 0x00000001
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) {
      const start = i + 4;
      const nalType = data[start] & 0x1f;

      // Find next start code or end
      let end = data.length;
      for (let j = start + 1; j < data.length - 3; j++) {
        if (data[j] === 0 && data[j + 1] === 0 && data[j + 2] === 0 && data[j + 3] === 1) {
          end = j;
          break;
        }
      }

      units.push({ type: nalType, data: data.subarray(start, end) });
      i = end;
    } else {
      i++;
    }
  }

  return units;
}

// Build an AVC Decoder Configuration Record (avcC box) from SPS and PPS NAL units
function buildAvcC(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  const buf = new Uint8Array(11 + sps.length + pps.length);
  let offset = 0;

  buf[offset++] = 1;           // configurationVersion
  buf[offset++] = sps[1];      // AVCProfileIndication
  buf[offset++] = sps[2];      // profile_compatibility
  buf[offset++] = sps[3];      // AVCLevelIndication
  buf[offset++] = 0xff;        // lengthSizeMinusOne = 3 (4-byte NAL length prefix)

  // SPS
  buf[offset++] = 0xe1;        // numOfSequenceParameterSets = 1
  buf[offset++] = (sps.length >> 8) & 0xff;
  buf[offset++] = sps.length & 0xff;
  buf.set(sps, offset);
  offset += sps.length;

  // PPS
  buf[offset++] = 1;           // numOfPictureParameterSets = 1
  buf[offset++] = (pps.length >> 8) & 0xff;
  buf[offset++] = pps.length & 0xff;
  buf.set(pps, offset);

  return buf;
}

import type { Application } from 'express';
import type { AppState } from '../index.js';

// Screen mirroring is handled by ws-scrcpy (separate process on port 8000)
// This file is kept as a placeholder for future WebSocket routes
export function screenRoutes(_app: Application, _state: AppState) {
  // No-op — ws-scrcpy handles device streaming
}

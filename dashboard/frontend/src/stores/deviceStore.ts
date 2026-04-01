import { create } from 'zustand';
import { api } from '../api/client';
import type { Device, DeviceInfo } from '../types';

interface DeviceState {
  devices: Device[];
  selectedDevice: string | null;
  deviceInfo: DeviceInfo | null;
  loading: boolean;
  error: string | null;
  fetchDevices: () => Promise<void>;
  selectDevice: (serial: string) => Promise<void>;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  devices: [],
  selectedDevice: null,
  deviceInfo: null,
  loading: false,
  error: null,

  fetchDevices: async () => {
    set({ loading: true, error: null });
    try {
      const devices = await api.getDevices();
      set({ devices, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  selectDevice: async (serial: string) => {
    set({ selectedDevice: serial, deviceInfo: null });
    try {
      await api.selectDevice(serial);
      const info = await api.getDeviceInfo(serial);
      set({ deviceInfo: info });
    } catch {
      // Device info optional
    }
  },
}));

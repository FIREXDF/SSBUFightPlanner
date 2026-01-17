// Global type declarations for Electron IPC exposed APIs

import { ElectronAPI, GeneralAPI } from '../../server/preload';

// Bootstrap types
interface BootstrapModalOptions {
  backdrop?: boolean | 'static';
  keyboard?: boolean;
  focus?: boolean;
}

interface BootstrapModal {
  show(): void;

  hide(): void;

  toggle(): void;

  dispose(): void;
}

interface BootstrapModalStatic {
  new (element: HTMLElement, options?: BootstrapModalOptions): BootstrapModal;

  getInstance(element: HTMLElement): BootstrapModal | null;

  getOrCreateInstance(element: HTMLElement): BootstrapModal;
}

interface BootstrapToast {
  show(): void;

  hide(): void;

  dispose(): void;
}

interface BootstrapToastStatic {
  new (element: HTMLElement): BootstrapToast;

  getInstance(element: HTMLElement): BootstrapToast | null;
}

interface BootstrapDropdown {
  show(): void;

  hide(): void;

  toggle(): void;

  update(): void;

  dispose(): void;
}

interface BootstrapDropdownStatic {
  new (element: HTMLElement, options?: any): BootstrapDropdown;

  getInstance(element: HTMLElement): BootstrapDropdown | null;
}

interface Bootstrap {
  Modal: BootstrapModalStatic;
  Toast: BootstrapToastStatic;
  Dropdown: BootstrapDropdownStatic;
}

declare global {
  interface Window {
    api: GeneralAPI;
    electron: ElectronAPI;
    bootstrap: Bootstrap;
    uiController?: any;
    _cachedModList?: any;
  }

  const bootstrap: Bootstrap;
}

export {};

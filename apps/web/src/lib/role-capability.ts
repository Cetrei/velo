import type { PeerRole } from 'shared-types';
import { getClientEnvironment } from './environment';

/**
 * What this physical device is actually capable of doing today, independent of which role the
 * signaling server assigned it. This is the common abstract contract both Host.tsx and Viewer.tsx
 * check against negotiatedRole instead of assuming their own hardcoded role, per TODO.md's
 * UI-symmetry entry. Each environment implements a fixed, real subset today:
 *   MOBILE_HOST (Capacitor/Android)   -> canCapture only (useCameraStream -> WebRTC track)
 *   DESKTOP_VIEWER (Tauri/Windows)    -> canReceive only (WebRTC track -> useFramePusher -> push_frame)
 *   WEB_SANDBOX (plain browser, used for Sandbox.tsx manual testing) -> canCapture only, same as
 *     MOBILE_HOST: any browser exposes getUserMedia, so useCameraStream works here too, but
 *     canReceive is false since push_frame is a Tauri-only IPC command with no browser equivalent.
 * Neither DESKTOP_VIEWER nor a plain browser can do the camera-receive-and-push-to-driver job's
 * final step yet outside Tauri: there is no camera-capture code path in the Tauri webview and no
 * virtual-camera-push code path on Android or in a plain browser. This type exists so that gap is
 * a typed, explicit fact instead of an implicit assumption baked into which view is mounted.
 */
export interface RoleCapability {
  canCapture: boolean;
  canReceive: boolean;
}

const ENVIRONMENT_CAPABILITY: Record<ReturnType<typeof getClientEnvironment>, RoleCapability> = {
  MOBILE_HOST: { canCapture: true, canReceive: false },
  DESKTOP_VIEWER: { canCapture: false, canReceive: true },
  WEB_SANDBOX: { canCapture: true, canReceive: false },
};

export function getLocalDeviceCapability(): RoleCapability {
  return ENVIRONMENT_CAPABILITY[getClientEnvironment()];
}

/**
 * A role is only actionable on this device if the negotiated role's required capability is one
 * this environment actually has. 'host' needs canCapture, 'viewer' needs canReceive.
 */
export function roleRequiresCapability(role: PeerRole): keyof RoleCapability {
  return role === 'host' ? 'canCapture' : 'canReceive';
}

export function deviceSupportsRole(capability: RoleCapability, role: PeerRole): boolean {
  return capability[roleRequiresCapability(role)];
}

const ROLE_LABELS: Record<PeerRole, string> = {
  host: 'camera source',
  viewer: 'camera receiver',
};

/**
 * Human-readable explanation for why this device cannot act as the role the server assigned it.
 * Surfaced directly in the UI rather than silently mismatching camera capture against frame
 * reception, since this repo's rules forbid silently assuming a solution for an unimplemented case.
 */
export function describeUnsupportedRole(role: PeerRole): string {
  return `This device was assigned the "${ROLE_LABELS[role]}" role for this session, but this app build cannot act as a ${ROLE_LABELS[role]} yet. Only the device that can be a ${role === 'host' ? 'camera receiver' : 'camera source'} today can pair with a ${ROLE_LABELS[role]}.`;
}

// Thin wrapper around Capacitor Haptics. No-ops safely on web or if unavailable.
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

export const haptic = {
  light: () => Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}),
  medium: () => Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {}),
  heavy: () => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}),
  success: () => Haptics.notification({ type: NotificationType.Success }).catch(() => {}),
  warning: () => Haptics.notification({ type: NotificationType.Warning }).catch(() => {}),
};

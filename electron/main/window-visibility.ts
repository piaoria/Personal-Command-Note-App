export type VisibilityWindow = {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  isVisible(): boolean;
  isFocused(): boolean;
  hide(): void;
  minimize(): void;
};

type VisibilityActions = { trayAvailable: boolean; show: () => void };

export default function toggleWindowVisibility(target: VisibilityWindow | null, actions: VisibilityActions): 'shown' | 'hidden' | 'minimized' | 'unavailable' {
  if (!target || target.isDestroyed()) return 'unavailable';
  // Read focus before showing: showing the window makes it focused and would
  // otherwise turn a request from another app into an immediate hide.
  const foreground = !target.isMinimized() && target.isVisible() && target.isFocused();
  if (!foreground) { actions.show(); return 'shown'; }
  if (actions.trayAvailable) { target.hide(); return 'hidden'; }
  target.minimize();
  return 'minimized';
}

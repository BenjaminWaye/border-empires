import type { Dock } from "@border-empires/shared";

const linkedDockCount = (dock: Dock): number => {
  if (dock.connectedDockIds?.length) return dock.connectedDockIds.length;
  return dock.pairedDockId ? 1 : 0;
};

export const dockRouteCooldownUntil = (dock: Dock, destinationDockId: string): number => {
  const routeCooldownUntil = dock.routeCooldownUntilByDockId?.[destinationDockId];
  if (typeof routeCooldownUntil === "number") return routeCooldownUntil;
  return linkedDockCount(dock) <= 1 ? dock.cooldownUntil : 0;
};

export const setDockRouteCooldownUntil = (dock: Dock, destinationDockId: string, cooldownUntil: number): void => {
  if (linkedDockCount(dock) <= 1) {
    dock.cooldownUntil = cooldownUntil;
    return;
  }
  dock.cooldownUntil = 0;
  dock.routeCooldownUntilByDockId = {
    ...(dock.routeCooldownUntilByDockId ?? {}),
    [destinationDockId]: cooldownUntil
  };
};

export const clearDockRouteCooldowns = (dock: Dock): void => {
  dock.cooldownUntil = 0;
  delete dock.routeCooldownUntilByDockId;
};

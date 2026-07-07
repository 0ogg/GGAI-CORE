import { Platform } from "obsidian";

export function isDesktop(): boolean {
  return Platform.isDesktop;
}

export function isMobile(): boolean {
  return Platform.isMobile;
}

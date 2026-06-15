function readNavigator(): { userAgent?: string; maxTouchPoints?: number } {
  return typeof navigator !== "undefined"
    ? (navigator as unknown as { userAgent?: string; maxTouchPoints?: number })
    : {};
}

export function isMobileWebKit(
  userAgent: string = readNavigator().userAgent ?? "",
  maxTouchPoints: number = readNavigator().maxTouchPoints ?? 0,
): boolean {
  if (!userAgent) return false;
  if (/iPhone|iPod|iPad/i.test(userAgent)) return true;
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return true;
  return false;
}

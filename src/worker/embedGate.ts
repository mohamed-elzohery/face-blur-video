import type { Box } from "@/lib/types";
import { boxCenterDist, iou } from "@/lib/coords";

export const BOOTSTRAP_HITS = 3;
export const MIN_TRACK_EMBEDS = 3;
export const MOVE_IOU = 0.9;
export const MOVE_CENTER_EPS = 0.02;
export const EMBED_PERIOD = 5;

export interface ReEmbedArgs {
  hits: number;
  trackEmbedCount: number;
  lastEmbedBox: Box | undefined;
  currentBox: Box;
  framesSinceLastEmbed: number;
}

export function shouldReEmbed(args: ReEmbedArgs): boolean {
  const { hits, trackEmbedCount, lastEmbedBox, currentBox, framesSinceLastEmbed } = args;
  if (lastEmbedBox === undefined) return true;
  if (hits <= BOOTSTRAP_HITS) return true;
  if (trackEmbedCount < MIN_TRACK_EMBEDS) return true;
  if (framesSinceLastEmbed >= EMBED_PERIOD) return true;
  if (iou(lastEmbedBox, currentBox) < MOVE_IOU) return true;
  if (boxCenterDist(lastEmbedBox, currentBox) > MOVE_CENTER_EPS) return true;
  return false;
}

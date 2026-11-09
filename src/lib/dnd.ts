import { closestCenter, pointerWithin, type CollisionDetection } from "@dnd-kit/core";

/** A tile lands where the cursor is, wherever it was grabbed. Outside the grid, the nearest tile wins. */
export const dropUnderCursor: CollisionDetection = (args) => {
  const under = pointerWithin(args);
  return under.length ? under : closestCenter(args);
};

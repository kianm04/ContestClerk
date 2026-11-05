/**
 * The look the live room's own three screens share: the lobby, the suspended
 * screen and the ended screen (`committee-room.md`, "Layout"; the study's
 * `.room-screen` and `.room-title`). Kept in one place so the three cannot
 * drift apart. Tailwind reads class names out of this file too.
 */

/**
 * Left-aligned, at most 920 px wide, in the middle of the window's height,
 * with 32 px between its parts; 24 px from the edges at 1024 and one column
 * 16 px from the edges on a phone.
 */
export const ROOM_SCREEN_CLASSES =
	'flex w-full max-w-230 flex-1 flex-col justify-center gap-8 px-14 py-12 max-[1100px]:px-6 max-md:justify-start max-md:px-4 max-md:py-6';

/**
 * The screen's heading, the page's `<h1>`: the serif at 44/48, 32/36 on a
 * phone. A script may focus it after a press (R12), which needs no outline.
 */
export const ROOM_TITLE_CLASSES =
	'font-display text-display text-balance focus:outline-none max-md:text-display-mobile';

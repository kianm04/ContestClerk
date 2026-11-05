/*
	The looks the paper writer's toolbar buttons share, in one place so the
	groups of tools drawn by separate components match
	(`$lib/components/paper-writing/`).

	`aria-pressed:` is Tailwind for "while `aria-pressed` is true", so a
	pressed button looks pressed from the same attribute a screen reader
	reads. The buttons are a little larger on a phone, for a finger.
*/

export const TOOL_CLASSES =
	'inline-flex size-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent aria-pressed:bg-selected aria-pressed:text-primary disabled:pointer-events-none disabled:text-placeholder sm:size-9';

/** A tool that is a word rather than a mark, such as "Comment" or "Opening phrase". */
export const WORD_TOOL_CLASSES =
	'inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-dense text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:text-placeholder sm:h-9';

// The hairline between groups of tools, left out on a phone where the tools wrap.
export const SEPARATOR_CLASSES = 'mx-1.5 h-5 w-px bg-border max-sm:hidden';

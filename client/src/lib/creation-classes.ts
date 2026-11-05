/**
 * `cn` for the steps of creating a conference (Trello fe3reN7Y).
 *
 * `cn` (from `$lib/utils`) merges Tailwind classes so that a later one replaces
 * an earlier one of the same kind: `cn('p-4', 'p-2')` is `p-2`. It only knows
 * Tailwind's own classes, though. Those steps set their type in the design's
 * pixels with `fs-*` and `lh-*` (`src/routes/layout.css`), which `cn` would
 * keep side by side, and then the stylesheet's order decides, not the caller.
 * This one knows them too: `fs-*` is a font size like `text-sm`, `lh-*` a line
 * height like `leading-6`, so a size passed into a creation component replaces
 * the component's own.
 */
import { createCn, validators } from 'cn/config';

export const creationClasses = createCn({
	extend: {
		classGroups: {
			'font-size': [{ fs: [validators.isNumber] }],
			leading: [{ lh: [validators.isNumber] }]
		}
	}
});

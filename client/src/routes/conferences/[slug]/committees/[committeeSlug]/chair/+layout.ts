import { clockOffsetSample } from '$lib/clock-offset';
import type { LayoutLoad } from './$types';

/**
 * A "universal" load function: it runs in the browser whenever fresh data
 * arrives from `+layout.server.ts` next to it (and on the server while a page
 * is first drawn there). `data` is whatever that server `load` returned.
 *
 * It exists to read the browser's clock the moment the answer arrives, while
 * the server's time in it is still fresh. The difference is how far the
 * browser's clock is off from the server's, which every timer on the chair
 * pages needs (`$lib/clock-offset.ts`). A component reading the clock later
 * would compare it with a server time that had grown old.
 */
export const load: LayoutLoad = ({ data }) => {
	return { ...data, clockOffsetSampleMs: clockOffsetSample(data.serverTime, new Date()) };
};

/**
 * A speakers list's speaking time as the chair types it in the GSL view's
 * list footer: "1:30", "90s", or a bare number of minutes such as "2"
 * (`specs/05-pages/chair/gsl.md`, "`setSpeakingTime`"). The footer's field,
 * the instant press that shows the new time at once and the server action all
 * read it here, so the three agree on what a typed time means.
 */

import { readDuration } from '$lib/motion-input';
import { MAX_SPEAKING_TIME_SECONDS, MIN_SPEAKING_TIME_SECONDS } from '$lib/speakers-lists';

/** The name of the footer's field, which the `setSpeakingTime` action reads. */
export const SPEAKING_TIME_FIELD = 'speakingTime';

/**
 * The seconds the chair typed, or null when the text is not a time
 * (`readDuration`) or the time is not between 30 seconds and 5 minutes.
 */
export function readTypedSpeakingTime(value: FormDataEntryValue | null): number | null {
	const seconds = readDuration(value);

	if (seconds === null) return null;
	if (seconds < MIN_SPEAKING_TIME_SECONDS || seconds > MAX_SPEAKING_TIME_SECONDS) return null;

	return seconds;
}

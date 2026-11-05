import { committeeRoomDependency } from '$lib/committee-room-live';
import { dayInTimezone } from '$lib/dates';
import { committeeToolsFor } from '$lib/chair-frame';
import { hasPermission } from '$lib/permissions';
import { requireCommitteePermission } from '$lib/server/access';
import { getChairRoomFrame, getConsoleFacts, isNamedChair } from '$lib/server/committee-room';
import { readMyPermissions } from '$lib/server/my-permissions';
import { readIsQuickSession } from '$lib/server/room-screens';
import type { LayoutServerLoad } from './$types';

/**
 * Runs on the server for every chair page of one committee, because it belongs
 * to the `chair` folder's layout.
 *
 * It checks once that the reader may run this committee's room (`run_room`),
 * and reads what the console's frame around every chair page
 * shows: the room's state, the sessions, the seats and who is present, then
 * the motions on the floor, whether anyone has spoken yet and the live list
 * for the live strip, and whether the committee is a quick session's.
 * Whatever it returns reaches every page underneath as `data`.
 *
 * `?end=confirm` draws End's confirmation and `?agenda=change` the agenda
 * menu open, which is how both work without JavaScript on every chair page.
 * Because this `load` reads the address, SvelteKit runs it again whenever
 * either changes.
 */
export const load: LayoutServerLoad = async ({ params, url, locals, depends }) => {
	// A visitor goes to sign in, and anybody else who may not run this room gets
	// a 404. Both throw, so everything below runs for a chair or an organiser.
	const { user, conference, committee } = await requireCommitteePermission(
		locals,
		url,
		params.slug,
		params.committeeSlug,
		'run_room'
	);

	// `depends` gives this `load` a name. When realtime hears that something in
	// the room changed, the layout calls `invalidate` with the same name, and
	// SvelteKit runs this `load` again (and every `load` that registered it).
	depends(committeeRoomDependency(committee.id));

	const [frame, isChair, permissions, isQuickSession] = await Promise.all([
		getChairRoomFrame(locals.supabase, committee.id),
		isNamedChair(locals.supabase, committee.id, user.id),
		readMyPermissions(locals.supabase, conference.id, user.id),
		readIsQuickSession(locals.supabase, conference.id)
	]);
	// Read after the frame, because the live list is the one its state points at.
	const consoleFacts = await getConsoleFacts(locals.supabase, frame.committeeState, frame.seats);

	return {
		conference: {
			id: conference.id,
			slug: conference.slug,
			name: conference.name,
			timezone: conference.timezone,
			// The room names its sessions and chooses its state from these days (T166).
			startDate: conference.startDate,
			endDate: conference.endDate,
			// The papers page shows whether papers are asked for at all, and by when.
			positionPaperRequired: conference.positionPaperRequired,
			positionPaperDeadline: conference.positionPaperDeadline
		},
		committee,
		...frame,
		...consoleFacts,
		isEndConfirmOpen: url.searchParams.get('end') === 'confirm',
		isAgendaMenuOpen: url.searchParams.get('agenda') === 'change',
		// Whoever edits every committee counts as an organiser here. The top bar
		// then says which of the two the reader is here as, with a link back to
		// their dashboard, and an empty lobby links to the seats.
		isOrganiser: hasPermission(permissions, 'manage_committees'),
		isNamedChair: isChair,
		// Papers, Notes and Awards each ask their own permission in the committee.
		committeeTools: committeeToolsFor(permissions, committee.id),
		// A quick session's console has no Awards, and its agenda menu can add a
		// topic, because its chair is its organiser too (`chair/quick-session.md`).
		isQuickSession,
		// The conference's own date in its timezone, as `/home` reads it.
		today: dayInTimezone(new Date(), conference.timezone),
		// The notes page calls the reader's own notes "You".
		readerId: user.id,
		// The server's time as the answer leaves, from which the browser works out
		// how far its own clock is off (`+layout.ts` and `$lib/clock-offset.ts`).
		serverTime: new Date().toISOString()
	};
};

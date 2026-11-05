import { fail, redirect } from '@sveltejs/kit';
import { conferencePhase } from '$lib/conference-phase';
import { dashboardForReader } from '$lib/dashboard-access';
import { attentionTitle, dashboardAttention } from '$lib/dashboard-attention';
import { dashboardFigures } from '$lib/dashboard-figures';
import { isFirstAttentionLinePrimary, quietAction } from '$lib/dashboard-layout';
import { dashboardSections } from '$lib/dashboard-sections';
import { dashboardStatusSentence } from '$lib/dashboard-status';
import { dayInTimezone } from '$lib/dates';
import { mayOpenManagePage } from '$lib/manage-pages';
import { createResumeUrl, manageConferenceUrl } from '$lib/urls';
import { requirePermission } from '$lib/server/access';
import { hasSeatedDelegates, setConferenceStatus } from '$lib/server/conferences';
import { setCreationStep } from '$lib/server/creation';
import { loadPhaseCards } from '$lib/server/dashboard-cards';
import { setFlash } from '$lib/server/flash';
import { loadConferenceDashboard } from '$lib/server/manage';
import type { Actions, PageServerLoad } from './$types';

/**
 * Everything the conference dashboard draws, on top of what the layout above
 * already read.
 *
 * `parent()` is a promise for whatever the layout's own `load` returned: this
 * conference, the organisation running it and, for a draft, which setup steps
 * are done, and the reader's permissions. The layout let in only somebody whose
 * permissions open some page of this conference, and section 8 of
 * `docs/roles-and-permissions.md` opens the dashboard to all of them: what it
 * shows is cut down to their permissions by `dashboardForReader` at the end.
 *
 * A draft has no dashboard for somebody who may edit it: they are sent back
 * into the creation flow at `/create/<slug>`, which is where their work is.
 *
 * Files under `$lib/server` only ever run on the server, so none of the queries
 * `loadConferenceDashboard` and `loadPhaseCards` make can reach the browser.
 * What each section says is written here by the pure functions of the
 * `$lib/dashboard-*.ts` files, so the page only draws what it is handed.
 */
export const load: PageServerLoad = async ({ parent, locals, cookies }) => {
	const { conference, setupProgress, flash, permissions } = await parent();

	// `setupProgress` is only read for a draft, and is `null` for every other
	// conference. `redirect` stops `load` here; 303 makes the browser ask for
	// the step's page with a plain GET. The creation flow asks what the details
	// page asks, so anybody else stays on a dashboard with no sections.
	if (setupProgress !== null && mayOpenManagePage(permissions, 'details')) {
		// "Unpublish" and an accepted invitation leave a message and send the
		// organiser here. The root layout has already read it and deleted the
		// cookie, so without leaving it again it would be lost on the way to
		// the step page.
		if (flash !== null) {
			setFlash(cookies, flash);
		}

		// The creation flow sends it on to the step it reached (Trello fe3reN7Y).
		redirect(303, createResumeUrl(conference.slug));
	}

	// The clock is read once and the answer handed to everything that needs it,
	// so the phase, the status sentence and the rooms' "As of" cannot end up
	// describing two different moments.
	const now = new Date();
	const phase = conferencePhase(conference, now);

	// Neither needs the other's answer, so both start at once.
	const [dashboard, cards] = await Promise.all([
		loadConferenceDashboard(locals.supabase, conference.id),
		loadPhaseCards(locals.supabase, conference, phase, now)
	]);

	const { stats, checklistCounts } = dashboard;

	const attention = dashboardAttention(phase, {
		conference,
		now,
		stats,
		committees: cards.committees,
		waiting: cards.waiting,
		allocation: cards.allocation,
		unpaidInvoices: cards.unpaidInvoices,
		rooms: cards.rooms,
		awardCounts: cards.awardCounts,
		hasFeesOrManualCollection:
			checklistCounts.feeCount > 0 || checklistCounts.collectsPaymentsManually
	});

	const figures = dashboardFigures(phase, {
		stats,
		committees: cards.committees,
		isPositionPaperRequired: conference.positionPaperRequired,
		shortDelegationCount: cards.allocation.shortDelegations.length,
		unpaidInvoiceCount: cards.unpaidInvoices.count,
		proposedAwardCount: cards.awardCounts.proposed,
		awardCount: cards.awardCounts.proposed + cards.awardCounts.confirmed
	});

	const sections = dashboardSections(phase, {
		conference,
		now,
		committees: cards.committees,
		recentApplications: dashboard.recentApplications,
		waiting: cards.waiting,
		isProgrammePublic: cards.allocation.isProgrammePublic,
		rooms: cards.rooms,
		todayEvents: cards.todayEvents
	});

	// Everything above was written as an administrator would see it; this
	// leaves out what leads to a page the reader may not open.
	const content = dashboardForReader(permissions, {
		figures,
		attention,
		sections,
		quietAction: quietAction(phase, conference.status, cards.isAnybodySeated)
	});

	return {
		summary: dashboardStatusSentence(phase, conference, now, {
			delegateCount: stats.seatsFilled,
			committeeCount: cards.committees.length
		}),
		figures: content.figures,
		attentionTitle: attentionTitle(phase),
		attention: content.attention,
		isFirstAttentionLinePrimary: isFirstAttentionLinePrimary(phase),
		quietAction: content.quietAction,
		sections: content.sections
	};
};

export const actions: Actions = {
	/**
	 * Take the conference back out of the directory.
	 *
	 * Refused once anybody holds a seat: those delegates would lose the page
	 * they were allocated from, and archiving is what a finished conference
	 * wants instead.
	 */
	unpublish: async ({ params, url, cookies, locals }) => {
		// A form action is its own request, and nothing `load` worked out reaches
		// it, so the organiser check is made here rather than trusted from
		// whenever the page was last drawn. Unpublishing is part of
		// `edit_conference`, and `archive` below asks the same.
		const { conference } = await requirePermission(locals, url, params.slug, 'edit_conference');

		const isAnybodySeated = await hasSeatedDelegates(locals.supabase, conference.id);

		if (isAnybodySeated) {
			return fail(400, {
				message:
					'You cannot unpublish once delegates are seated. Archive it after the conference instead.'
			});
		}

		await setConferenceStatus(locals.supabase, conference.id, 'draft');
		// A draft is reopened in the creation steps, and one that has been
		// public has been through all of them: it comes back at Launch, ready to
		// be published again, rather than at Basics.
		await setCreationStep(locals.supabase, conference.id, 'launch');

		setFlash(cookies, { tone: 'success', message: `${conference.name} is no longer public.` });
		redirect(303, manageConferenceUrl(params.slug));
	},

	/**
	 * Put a finished conference away: participants keep their access, but it
	 * leaves the directory.
	 *
	 * Only a conference that has been public, and only once it is over. The page
	 * file names the date alone; the status is ours, because this action's own
	 * question is about a conference leaving the directory and a draft has never
	 * been in it. A draft that is over is deleted rather than archived.
	 */
	archive: async ({ params, url, cookies, locals }) => {
		// Checked again for the reason given on `unpublish` above.
		const { conference } = await requirePermission(locals, url, params.slug, 'edit_conference');

		if (conference.status !== 'published') {
			return fail(400, { message: 'Only a published conference can be archived.' });
		}

		// Both sides are `YYYY-MM-DD`, so comparing them as text compares them as
		// dates. That is the one ordering the format was chosen for, and the rest
		// of the codebase compares dates this way too. The day is worked out in
		// the conference's own timezone, because "today" is a different day in
		// different places.
		const today = dayInTimezone(new Date(), conference.timezone);

		if (conference.endDate >= today) {
			return fail(400, { message: 'You can archive after the last day.' });
		}

		await setConferenceStatus(locals.supabase, conference.id, 'archived');

		setFlash(cookies, { tone: 'success', message: `${conference.name} is archived.` });
		redirect(303, manageConferenceUrl(params.slug));
	}
};

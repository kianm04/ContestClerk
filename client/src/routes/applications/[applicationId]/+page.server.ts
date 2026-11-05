import { error, redirect } from '@sveltejs/kit';
import {
	TEAM_CODE_MISSING_REFUSAL,
	TEAM_JOINED_FLASH,
	TEAM_LEFT_FLASH,
	TEAM_STARTED_FLASH,
	normaliseTeamCode,
	teamRefusal
} from '$lib/application-teams';
import { canEditApplication, nextStatuses, type ApplicationStatus } from '$lib/applications';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import { isAcceptingApplications } from '$lib/conferences';
import { applicationUrl, myApplicationsUrl } from '$lib/urls';
import { requireOnboarded } from '$lib/server/access';
import {
	deleteDraftApplication,
	getMyApplication,
	withdrawApplication,
	type MyApplicationPage
} from '$lib/server/applications';
import { joinMyTeam, leaveMyTeam, readMyTeam, startMyTeam } from '$lib/server/application-teams';
import { setFlash } from '$lib/server/flash';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/** What the page says when the application is not there, or is not this reader's. */
const NO_SUCH_APPLICATION = 'This application does not exist.';

/** What both refusals to withdraw say, whichever of the two noticed first. */
const CANNOT_WITHDRAW = 'This application can no longer be withdrawn.';

/** The same for the two refusals to delete a draft. */
const CANNOT_DELETE_DRAFT = 'This draft can no longer be deleted.';

/**
 * Whether the applicant may still start, join or leave a team: until the
 * organisers have decided, because a decided application keeps the team it
 * was decided with (Trello pZNcdPqU).
 */
function canChangeTeam(status: ApplicationStatus): boolean {
	return status === 'draft' || status === 'submitted' || status === 'waitlisted';
}

/**
 * Runs one of the three team changes, then sends the applicant back to this
 * page with a flash saying what happened. The database refuses in sentences
 * meant for the applicant, which `teamRefusal` passes on; anything else is
 * logged and replaced with the usual apology.
 */
async function changeTeam(
	event: RequestEvent,
	change: () => Promise<void>,
	successMessage: string
): Promise<never> {
	const applicationUrlHere = applicationUrl(event.params.applicationId);

	try {
		await change();
	} catch (thrown) {
		const databaseMessage = thrown instanceof Error ? thrown.message : String(thrown);
		const refusal = teamRefusal(databaseMessage);

		if (refusal === null) {
			console.error('Could not change an application team', thrown);
		}

		setFlash(event.cookies, { tone: 'error', message: refusal ?? UNEXPECTED_ERROR_TEXT });
		redirect(303, applicationUrlHere);
	}

	setFlash(event.cookies, { tone: 'success', message: successMessage });
	redirect(303, applicationUrlHere);
}

/**
 * Read the signed-in reader's own application, or answer 404.
 *
 * The reader's id is part of the question rather than being left to Row Level
 * Security, because the `applications` select policy is "self; org.": an
 * organiser of the conference really can read the row. `05-pages/delegate/
 * application.md` says an organiser gets a 404 here and uses
 * `/manage/[slug]/applications/[applicationId]` instead, so the query asks for
 * the row belonging to this reader and nobody else.
 *
 * Both actions call this again rather than trusting what `load` worked out. A
 * form action is its own request and is handed nothing `load` decided, which is
 * what `specs/02-architecture/permissions.md` asks of every action.
 *
 * `$lib/server` only ever runs on the server, so the query below cannot reach
 * the browser.
 */
async function requireMyApplication(event: RequestEvent): Promise<MyApplicationPage> {
	const user = await requireOnboarded(event.locals, event.url);

	const page = await getMyApplication(event.locals.supabase, event.params.applicationId, user.id);

	if (!page) {
		error(404, NO_SUCH_APPLICATION);
	}

	return page;
}

/**
 * Runs on the server before the page is rendered. Whatever it returns arrives
 * in `+page.svelte` as `data`.
 *
 * `./$types` holds the types SvelteKit generates for this one route, so
 * `PageServerLoad` already knows that `params` has an `applicationId` in it.
 */
export const load: PageServerLoad = async (event) => {
	const page = await requireMyApplication(event);

	/*
		The clock is read once here and never handed on. Every question that needs
		it is answered below, so nothing the page draws has to ask what time it is:
		a component that called `new Date()` would write one thing while the page is
		rendered on the server and another a moment later in the browser, which
		Svelte reports as a hydration mismatch. The moment itself is deliberately
		not returned — a `load` that hands the browser data nothing draws is a thing
		the next reader has to check before they can change it, which is what T67's
		review said about a `settings` object and what the apply page beside this
		one does too.
	*/
	const isWindowOpen = isAcceptingApplications(page.conference, new Date());

	// The friends this applicant is applying with, and the code that lets more join.
	const team = await readMyTeam(event.locals.supabase, page.conference.id, page.application.id);

	return {
		...page,
		team,
		/** Whether the team section offers its forms, or only says who is in the team. */
		canChangeTeam: canChangeTeam(page.application.status),
		/** Whether the conference is taking applications at all right now. */
		isWindowOpen,
		/** Whether "Edit application" is offered: `draft` or `submitted`, window open. */
		canEdit: canEditApplication(page.application.status, isWindowOpen),
		/** Whether the status machine still allows the applicant to withdraw. */
		canWithdraw: nextStatuses(page.application.status, 'applicant').includes('withdrawn'),
		/** Deleting a draft is a real delete, and only a draft has one to offer. */
		canDeleteDraft: page.application.status === 'draft'
	};
};

export const actions: Actions = {
	/**
	 * Take the application out of the running, from `submitted` or `waitlisted`.
	 *
	 * Every ending redirects back to this same page, which is what
	 * `05-pages/delegate/application.md` asks for, and the message travels in a
	 * one-shot cookie that the root layout reads and throws away. A redirecting
	 * action cannot return anything, so there is no result type to declare.
	 */
	withdraw: async (event) => {
		const { application } = await requireMyApplication(event);
		const applicationId = event.params.applicationId;

		// The status machine in `06-features/applications.md` allows this only from
		// `submitted` and `waitlisted`. Only a request somebody put together by
		// hand can get here from any other status, because the button is not drawn.
		if (!nextStatuses(application.status, 'applicant').includes('withdrawn')) {
			setFlash(event.cookies, { tone: 'error', message: CANNOT_WITHDRAW });
			redirect(303, applicationUrl(applicationId));
		}

		// `false` means the row was no longer in a status the update trigger
		// allows: an organiser decided on it between the page being drawn and the
		// button being pressed.
		const wasWithdrawn = await withdrawApplication(event.locals.supabase, applicationId);

		if (!wasWithdrawn) {
			setFlash(event.cookies, { tone: 'error', message: CANNOT_WITHDRAW });
			redirect(303, applicationUrl(applicationId));
		}

		setFlash(event.cookies, { tone: 'success', message: 'Application withdrawn.' });
		redirect(303, applicationUrl(applicationId));
	},

	/** Start a team; the page then shows its code for friends to join with. */
	startTeam: async (event) => {
		await requireMyApplication(event);

		await changeTeam(
			event,
			() => startMyTeam(event.locals.supabase, event.params.applicationId),
			TEAM_STARTED_FLASH
		);
	},

	/** Join a friend's team with the code they passed on. */
	joinTeam: async (event) => {
		await requireMyApplication(event);

		const formData = await event.request.formData();
		const code = normaliseTeamCode(String(formData.get('code') ?? ''));

		if (code === '') {
			setFlash(event.cookies, { tone: 'error', message: TEAM_CODE_MISSING_REFUSAL });
			redirect(303, applicationUrl(event.params.applicationId));
		}

		await changeTeam(
			event,
			() => joinMyTeam(event.locals.supabase, event.params.applicationId, code),
			TEAM_JOINED_FLASH
		);
	},

	/** Apply on one's own again. */
	leaveTeam: async (event) => {
		await requireMyApplication(event);

		await changeTeam(
			event,
			() => leaveMyTeam(event.locals.supabase, event.params.applicationId),
			TEAM_LEFT_FLASH
		);
	},

	/** Throw away an application that was never submitted. This is a real delete. */
	deleteDraft: async (event) => {
		const { application } = await requireMyApplication(event);
		const applicationId = event.params.applicationId;

		if (application.status !== 'draft') {
			setFlash(event.cookies, { tone: 'error', message: CANNOT_DELETE_DRAFT });
			redirect(303, applicationUrl(applicationId));
		}

		// `false` means the row was submitted in the meantime, which Row Level
		// Security no longer lets the applicant delete.
		const wasDeleted = await deleteDraftApplication(event.locals.supabase, applicationId);

		if (!wasDeleted) {
			setFlash(event.cookies, { tone: 'error', message: CANNOT_DELETE_DRAFT });
			redirect(303, applicationUrl(applicationId));
		}

		setFlash(event.cookies, { tone: 'success', message: 'Draft deleted.' });

		// `05-pages/delegate/application.md` sends this to `/applications`, the
		// "My applications" list.
		redirect(303, myApplicationsUrl());
	}
};

import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import { ORGANISER_AWARD_REFUSALS } from '$lib/award-form';
import type { Award, AwardSeat, CommitteeAwards } from '$lib/awards';
import type { Conference } from '$lib/conferences';
import { manageAwardsUrl } from '$lib/urls';

// The gate and the award queries are stood in for, so these tests are about
// what the page decides: which refusal each rule answers with, what it writes,
// and where it sends the organiser back. The queries have their own tests in
// `src/lib/server/awards.test.ts` and `award-changes.test.ts`, what the
// database allows is in `tests/db/awards.test.ts`, and the whole page runs
// against a real database in `tests/e2e/awards.spec.ts`.
vi.mock('$lib/server/access', () => ({
	requireManagePage: vi.fn(),
	requirePermission: vi.fn(),
	requireUser: vi.fn()
}));

vi.mock('$lib/server/awards', () => ({
	listAwardSeats: vi.fn(),
	listAwardsByCommittee: vi.fn(),
	readAwardsPublishedAt: vi.fn()
}));

vi.mock('$lib/server/award-changes', () => ({
	addConfirmedAward: vi.fn(),
	deleteAward: vi.fn(),
	publishAwards: vi.fn(),
	renameAward: vi.fn(),
	setAwardStatus: vi.fn(),
	unpublishAwards: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireManagePage, requirePermission, requireUser } from '$lib/server/access';
import {
	addConfirmedAward,
	deleteAward,
	publishAwards,
	renameAward,
	setAwardStatus,
	unpublishAwards
} from '$lib/server/award-changes';
import { listAwardSeats, listAwardsByCommittee, readAwardsPublishedAt } from '$lib/server/awards';
import { setFlash } from '$lib/server/flash';
import type { MyPermissions } from '$lib/permissions';

/** What the layout hands down for an organiser: `administrator` opens every page. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** The Supabase client. The page only hands it on to the server modules above. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

const SLUG = 'thimun-2027';
const AWARDS_PATH = `/manage/${SLUG}/awards`;

/** Only the fields `load` and the actions read. */
const CONFERENCE = {
	id: 'conference-1',
	slug: SLUG,
	timezone: 'Europe/Amsterdam'
} as Conference;

const SEAT_FR: AwardSeat = {
	id: 'seat-fr',
	name: 'France',
	countryCode: 'FR',
	isFilled: true,
	delegateName: 'Amira Haddad'
};

/** A chair's proposal for France. */
const PROPOSAL: Award = {
	id: 'award-1',
	committeeId: 'committee-1',
	seatId: SEAT_FR.id,
	seatName: 'France',
	countryCode: 'FR',
	holderName: 'Amira Haddad',
	isSeatEmpty: false,
	kind: 'best_delegate',
	title: 'Best Delegate',
	status: 'proposed',
	createdBy: 'chair-1',
	proposerName: 'Ada'
};

/** A custom award the reader, `organiser-1`, added. */
const OWN_CUSTOM: Award = {
	...PROPOSAL,
	id: 'award-2',
	kind: 'custom',
	title: 'Best Speech',
	status: 'confirmed',
	createdBy: 'organiser-1'
};

/** Security Council with both awards, and ECOSOC with none. */
function makeSections(awards: Award[] = [PROPOSAL, OWN_CUSTOM]): CommitteeAwards[] {
	return [
		{
			committee: { id: 'committee-1', name: 'Security Council', abbreviation: 'UNSC' },
			awards,
			filledSeats: [SEAT_FR]
		},
		{
			committee: { id: 'committee-2', name: 'ECOSOC', abbreviation: null },
			awards: [],
			filledSeats: []
		}
	];
}

/** A post to one of the page's actions. */
function makeActionEvent(actionName: string, fields: Record<string, string>): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return {
		params: { slug: SLUG },
		url: new URL(`http://localhost${AWARDS_PATH}?/${actionName}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** The page `load`'s event. `parent()` answers what the manage layout returned. */
function makeLoadEvent(search = ''): PageServerLoadEvent {
	return {
		params: { slug: SLUG },
		url: new URL(`http://localhost${AWARDS_PATH}${search}`),
		locals: { supabase: SUPABASE },
		parent: async () => ({ conference: CONFERENCE, permissions: ADMINISTRATOR })
	} as unknown as PageServerLoadEvent;
}

/** Run something expected to redirect, and give back the redirect SvelteKit threw. */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** What `fail(400, ...)` gives back: a value the action returns, not throws. */
type FailResult = {
	status: number;
	data: {
		flash: { message: string };
		committeeId: string | null;
		values: { seatId: string; kind: string; title: string } | null;
		errors: Record<string, string>;
		publish: { when: string; publishAt: string } | null;
	};
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.useRealTimers();

	const organiser = { id: 'organiser-1', email: 'org@example.com' };

	vi.mocked(requireUser).mockResolvedValue(organiser);
	vi.mocked(requirePermission).mockResolvedValue({ user: organiser, conference: CONFERENCE });
	vi.mocked(listAwardsByCommittee).mockResolvedValue(makeSections());
	vi.mocked(readAwardsPublishedAt).mockResolvedValue(null);
	vi.mocked(listAwardSeats).mockResolvedValue([{ ...SEAT_FR, committeeId: 'committee-1' }]);
	vi.mocked(setAwardStatus).mockResolvedValue(true);
	vi.mocked(addConfirmedAward).mockResolvedValue('saved');
	vi.mocked(deleteAward).mockResolvedValue(true);
});

describe('load', () => {
	it('asks the permissions the layout read whether this page opens for the reader', async () => {
		await load(makeLoadEvent());

		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'awards');
	});

	it('hands back every committee, the counts and the committees without awards', async () => {
		const result = await load(makeLoadEvent());

		expect(listAwardsByCommittee).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(result).toMatchObject({
			awardsPublishedAt: null,
			counts: { confirmed: 1, proposed: 1, committeesWithoutAwards: 1 },
			committeesWithoutAwards: ['ECOSOC'],
			readerId: 'organiser-1',
			renamingAwardId: null,
			addingCommitteeId: null
		});
	});

	it('opens "Add award" for the committee in the address', async () => {
		const result = await load(makeLoadEvent('?add=committee-1'));

		expect(result?.addingCommitteeId).toBe('committee-1');
	});

	it('opens no "Add award" once the awards are published', async () => {
		vi.mocked(readAwardsPublishedAt).mockResolvedValue('2027-02-15T16:00:00Z');

		const result = await load(makeLoadEvent('?add=committee-1'));

		expect(result?.addingCommitteeId).toBeNull();
	});

	it('opens "Edit title" on a custom award the reader added', async () => {
		const result = await load(makeLoadEvent('?edit=award-2'));

		expect(result?.renamingAwardId).toBe('award-2');
	});

	it('does not open "Edit title" on a chair’s award', async () => {
		const result = await load(makeLoadEvent('?edit=award-1'));

		expect(result?.renamingAwardId).toBeNull();
	});
});

describe('the organiser gate', () => {
	it('lets the 404 of requirePermission propagate and writes nothing', async () => {
		vi.mocked(requirePermission).mockImplementation(() => {
			error(404, 'This conference does not exist.');
		});

		const event = makeActionEvent('confirm', { awardId: 'award-1' });

		await expect(actions.confirm(event)).rejects.toMatchObject({ status: 404 });
		expect(setAwardStatus).not.toHaveBeenCalled();
	});
});

describe('confirm and unconfirm', () => {
	it('confirms a proposal and changes nothing else', async () => {
		const thrown = await catchRedirect(() =>
			actions.confirm(makeActionEvent('confirm', { awardId: 'award-1' }))
		);

		expect(setAwardStatus).toHaveBeenCalledWith(SUPABASE, 'award-1', 'confirmed');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Confirmed.' });
		expect(thrown).toMatchObject({ status: 303, location: manageAwardsUrl(SLUG) });
	});

	it('sends a confirmed award back to proposed', async () => {
		await catchRedirect(() =>
			actions.unconfirm(makeActionEvent('unconfirm', { awardId: 'award-2' }))
		);

		expect(setAwardStatus).toHaveBeenCalledWith(SUPABASE, 'award-2', 'proposed');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Back to proposed.'
		});
	});

	it('refuses to confirm a proposal whose seat was freed', async () => {
		vi.mocked(listAwardsByCommittee).mockResolvedValue(
			makeSections([{ ...PROPOSAL, isSeatEmpty: true }])
		);

		const result = (await actions.confirm(
			makeActionEvent('confirm', { awardId: 'award-1' })
		)) as FailResult;

		expect(result.data.flash.message).toBe('That seat has no delegate.');
		expect(setAwardStatus).not.toHaveBeenCalled();
	});

	it('refuses an award that is not part of this conference', async () => {
		const result = (await actions.confirm(
			makeActionEvent('confirm', { awardId: 'award-elsewhere' })
		)) as FailResult;

		expect(result.data.flash.message).toBe(ORGANISER_AWARD_REFUSALS.missing);
		expect(setAwardStatus).not.toHaveBeenCalled();
	});

	it('refuses both once the awards are published', async () => {
		vi.mocked(readAwardsPublishedAt).mockResolvedValue('2027-02-15T16:00:00Z');

		const result = (await actions.unconfirm(
			makeActionEvent('unconfirm', { awardId: 'award-2' })
		)) as FailResult;

		expect(result.data.flash.message).toBe('Unpublish the awards before changing them.');
		expect(setAwardStatus).not.toHaveBeenCalled();
	});
});

describe('add', () => {
	it('adds a confirmed award titled with its kind', async () => {
		const event = makeActionEvent('add', {
			committeeId: 'committee-1',
			seatId: 'seat-fr',
			kind: 'honourable_mention'
		});

		await catchRedirect(() => actions.add(event));

		expect(addConfirmedAward).toHaveBeenCalledWith(SUPABASE, 'committee-1', {
			seatId: 'seat-fr',
			seatName: 'France',
			kind: 'honourable_mention',
			title: 'Honourable Mention'
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Award added.' });
	});

	it('refuses a custom award without a title, back to that committee’s form', async () => {
		const event = makeActionEvent('add', {
			committeeId: 'committee-1',
			seatId: 'seat-fr',
			kind: 'custom',
			title: ''
		});

		const result = (await actions.add(event)) as FailResult;

		expect(result.data.flash.message).toBe('Give the award a title.');
		expect(result.data.committeeId).toBe('committee-1');
		expect(result.data.errors).toEqual({ title: 'Give the award a title.' });
		expect(addConfirmedAward).not.toHaveBeenCalled();
	});

	it('words a second award of the same kind for one seat', async () => {
		vi.mocked(addConfirmedAward).mockResolvedValue('duplicate');
		const event = makeActionEvent('add', {
			committeeId: 'committee-1',
			seatId: 'seat-fr',
			kind: 'best_delegate'
		});

		const result = (await actions.add(event)) as FailResult;

		expect(result.data.errors).toEqual({ seatId: 'This delegate already has that award.' });
	});

	it('answers 404 for a committee that is not this conference’s', async () => {
		const event = makeActionEvent('add', {
			committeeId: 'committee-elsewhere',
			seatId: 'seat-fr',
			kind: 'best_delegate'
		});

		await expect(actions.add(event)).rejects.toMatchObject({ status: 404 });
		expect(addConfirmedAward).not.toHaveBeenCalled();
	});

	it('answers 404 for a seat that is not the committee’s', async () => {
		const event = makeActionEvent('add', {
			committeeId: 'committee-1',
			seatId: 'seat-elsewhere',
			kind: 'best_delegate'
		});

		await expect(actions.add(event)).rejects.toMatchObject({ status: 404 });
		expect(addConfirmedAward).not.toHaveBeenCalled();
	});

	it('asks for a seat when none was picked', async () => {
		const event = makeActionEvent('add', {
			committeeId: 'committee-1',
			seatId: '',
			kind: 'best_delegate'
		});

		const result = (await actions.add(event)) as FailResult;

		expect(result.data.errors).toEqual({ seatId: 'Pick a seat.' });
	});
});

describe('updateTitle', () => {
	it('renames a custom award the reader added', async () => {
		const event = makeActionEvent('updateTitle', { awardId: 'award-2', title: ' Best Diplomat ' });

		await catchRedirect(() => actions.updateTitle(event));

		expect(renameAward).toHaveBeenCalledWith(SUPABASE, OWN_CUSTOM, 'Best Diplomat');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Title saved.' });
	});

	it('refuses a chair’s award', async () => {
		const event = makeActionEvent('updateTitle', { awardId: 'award-1', title: 'New' });

		const result = (await actions.updateTitle(event)) as FailResult;

		expect(result.data.flash.message).toBe(ORGANISER_AWARD_REFUSALS.notCustom);
		expect(renameAward).not.toHaveBeenCalled();
	});

	it('refuses an empty title and keeps the form open with the message', async () => {
		const event = makeActionEvent('updateTitle', { awardId: 'award-2', title: '  ' });

		const result = (await actions.updateTitle(event)) as FailResult;

		expect(result.data.errors).toEqual({ title: 'Give the award a title.' });
		expect(result.data.committeeId).toBeNull();
		expect(renameAward).not.toHaveBeenCalled();
	});
});

describe('delete', () => {
	it('removes the award from its own committee', async () => {
		const event = makeActionEvent('delete', { awardId: 'award-1', confirm: '1' });

		await catchRedirect(() => actions.delete(event));

		expect(deleteAward).toHaveBeenCalledWith(SUPABASE, 'committee-1', 'award-1');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Award removed.' });
	});

	it('refuses a post that was not confirmed', async () => {
		const result = (await actions.delete(
			makeActionEvent('delete', { awardId: 'award-1' })
		)) as FailResult;

		expect(result.data.flash.message).toBe(ORGANISER_AWARD_REFUSALS.confirm);
		expect(deleteAward).not.toHaveBeenCalled();
	});

	it('refuses once the awards are published', async () => {
		vi.mocked(readAwardsPublishedAt).mockResolvedValue('2027-02-15T16:00:00Z');

		const result = (await actions.delete(
			makeActionEvent('delete', { awardId: 'award-1', confirm: '1' })
		)) as FailResult;

		expect(result.data.flash.message).toBe('Unpublish the awards before changing them.');
		expect(deleteAward).not.toHaveBeenCalled();
	});
});

describe('publish', () => {
	it('publishes now and says the recipients were told', async () => {
		vi.useFakeTimers({ now: new Date('2027-02-15T16:00:00Z'), toFake: ['Date'] });

		await catchRedirect(() => actions.publish(makeActionEvent('publish', { when: 'now' })));

		expect(publishAwards).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, '2027-02-15T16:00:00.000Z');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Awards published. Recipients have been notified.'
		});
	});

	it('schedules a moment typed in the conference’s own time', async () => {
		vi.useFakeTimers({ now: new Date('2027-02-15T12:00:00Z'), toFake: ['Date'] });
		const event = makeActionEvent('publish', { when: 'scheduled', publishAt: '2027-02-15T17:00' });

		await catchRedirect(() => actions.publish(event));

		expect(publishAwards).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.stringMatching(/^2027-02-15T16:00:00/)
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Awards will be visible from 15 Feb 2027, 17:00.'
		});
	});

	it('refuses a scheduled moment in the past and keeps the panel as sent', async () => {
		vi.useFakeTimers({ now: new Date('2027-02-15T20:00:00Z'), toFake: ['Date'] });
		const fields = { when: 'scheduled', publishAt: '2027-02-15T17:00' };

		const result = (await actions.publish(makeActionEvent('publish', fields))) as FailResult;

		expect(result.data.flash.message).toBe('Choose a moment in the future.');
		expect(result.data.publish).toEqual(fields);
		expect(publishAwards).not.toHaveBeenCalled();
	});

	it('refuses when nothing is confirmed', async () => {
		vi.mocked(listAwardsByCommittee).mockResolvedValue(makeSections([PROPOSAL]));

		const result = (await actions.publish(
			makeActionEvent('publish', { when: 'now' })
		)) as FailResult;

		expect(result.data.flash.message).toBe('Confirm at least one award before publishing.');
		expect(publishAwards).not.toHaveBeenCalled();
	});

	it('refuses when a confirmed award points at an empty seat', async () => {
		vi.mocked(listAwardsByCommittee).mockResolvedValue(
			makeSections([{ ...OWN_CUSTOM, isSeatEmpty: true }])
		);

		const result = (await actions.publish(
			makeActionEvent('publish', { when: 'now' })
		)) as FailResult;

		expect(result.data.flash.message).toBe(
			'Best Speech in Security Council points at an empty seat. Fix or delete it first.'
		);
		expect(publishAwards).not.toHaveBeenCalled();
	});

	it('refuses to publish twice', async () => {
		vi.mocked(readAwardsPublishedAt).mockResolvedValue('2027-02-15T16:00:00Z');

		const result = (await actions.publish(
			makeActionEvent('publish', { when: 'now' })
		)) as FailResult;

		expect(result.data.flash.message).toBe('Unpublish the awards before changing them.');
		expect(publishAwards).not.toHaveBeenCalled();
	});
});

describe('unpublish', () => {
	it('hides the awards again', async () => {
		await catchRedirect(() => actions.unpublish(makeActionEvent('unpublish', { confirm: '1' })));

		expect(unpublishAwards).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Awards hidden again. Notifications already sent stay.'
		});
	});

	it('refuses a post that was not confirmed', async () => {
		const result = (await actions.unpublish(makeActionEvent('unpublish', {}))) as FailResult;

		expect(result.data.flash.message).toBe(ORGANISER_AWARD_REFUSALS.confirm);
		expect(unpublishAwards).not.toHaveBeenCalled();
	});
});

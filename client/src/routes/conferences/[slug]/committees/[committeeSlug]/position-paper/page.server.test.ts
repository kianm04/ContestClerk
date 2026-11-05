import { redirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conference } from '$lib/conferences';
import type { PositionPaperFile } from '$lib/documents';
import { load, actions } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { MyPositionPaper } from '$lib/server/position-papers';

// `getMyPositionPaper`, `uploadPositionPaper` and `removePositionPaper` have
// their own tests in `$lib/server/position-papers.test.ts`, so they are stood
// in for here. These tests are only about what this route decides on top of
// them: who it lets in, which of the two checking functions it asks before
// acting, and what it answers with when either refuses.
vi.mock('$lib/server/access', () => ({ requireOnboarded: vi.fn() }));
vi.mock('$lib/server/position-papers', () => ({
	getMyPositionPaper: vi.fn(),
	uploadPositionPaper: vi.fn(),
	removePositionPaper: vi.fn(),
	submitWrittenPaper: vi.fn()
}));
// The draft of a written paper (T145) has its own tests in `position-paper-drafts.test.ts`.
vi.mock('$lib/server/position-paper-drafts', () => ({
	readPaperDraft: vi.fn(),
	savePaperDraft: vi.fn(),
	deletePaperDraft: vi.fn()
}));
vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));
// Who the draft is shared with (T147) has its own tests beside `delegation-papers.ts`.
vi.mock('$lib/server/delegation-papers', () => ({ readPaperSharing: vi.fn() }));
// Only the live setup is stood in for; the live save keeps the real module's shape.
vi.mock('$lib/server/paper-live-drafts', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/paper-live-drafts')>()),
	readLivePaperSetup: vi.fn(),
	// No live document is stored, so a plain "Save draft" has no suggestions to lose.
	readLiveDocumentState: vi.fn(async () => null)
}));

// The margin's threads have their own tests in `$lib/server/paper-comments.test.ts`.
vi.mock('$lib/server/paper-comments', () => ({
	readPaperThreads: vi.fn(async () => []),
	markThreadNotificationsRead: vi.fn()
}));

import { requireOnboarded } from '$lib/server/access';
import { readPaperSharing } from '$lib/server/delegation-papers';
import { setFlash } from '$lib/server/flash';
import { markThreadNotificationsRead, readPaperThreads } from '$lib/server/paper-comments';
import { readLivePaperSetup } from '$lib/server/paper-live-drafts';
import {
	getMyPositionPaper,
	removePositionPaper,
	submitWrittenPaper,
	uploadPositionPaper
} from '$lib/server/position-papers';
import {
	deletePaperDraft,
	readPaperDraft,
	savePaperDraft
} from '$lib/server/position-paper-drafts';
import { PAPER_WRITING_MESSAGES } from '$lib/paper-writing';

/** The Supabase client. This route only ever hands it on to `$lib/server`. */
const SUPABASE = {};

/** Somebody signed in who has finished onboarding, as `requireOnboarded` returns them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/** A conference with no position paper deadline. Tests spread it and change what they need. */
const CONFERENCE: Conference = {
	id: 'conference-1',
	slug: 'thimun-2027',
	name: 'THIMUN 2027',
	description: null,
	organizationName: 'THIMUN Foundation',
	organizationSlug: 'thimun-foundation',
	city: 'The Hague',
	countryCode: 'NL',
	countryName: 'Netherlands',
	locationMode: 'in_person',
	venueStatus: 'tba',
	conferenceTimeStatus: 'tba',
	startTime: null,
	endTime: null,
	feeStatus: 'undecided',
	applicationOpenMode: 'on_publish',
	startDate: '2027-01-24',
	endDate: '2027-01-29',
	websiteUrl: null,
	bannerPath: null,
	logoPath: null,
	level: 'high_school',
	status: 'published',
	timezone: 'Europe/Amsterdam',
	expectedDelegates: 3000,
	applicationsOpenAt: null,
	applicationsCloseAt: null,
	committeeCount: 8,
	committeeNames: [],
	tagline: null,
	venueName: null,
	venueAddress: null,
	contactEmail: null,
	instagramUrl: null,
	contactPhone: null,
	facebookUrl: null,
	linkedinUrl: null,
	youtubeUrl: null,
	tiktokUrl: null,
	language: 'English',
	minAge: null,
	maxAge: null,
	positionPaperRequired: true,
	positionPaperDeadline: null,
	acceptsIndividualApplications: true,
	acceptsDelegations: true
};

/** A paper already uploaded and awaiting review. Tests spread it and change what they need. */
const PAPER: PositionPaperFile = {
	id: 'paper-1',
	fileName: 'france-unsc.pdf',
	fileSizeBytes: 312000,
	reviewStatus: 'submitted',
	reviewComment: null,
	uploadedAt: '2026-09-01T10:00:00Z',
	downloadUrl: 'https://storage.example/signed/france-unsc.pdf',
	bodyMarkdown: null,
	bodyHtml: null
};

/** Everything `getMyPositionPaper` answers with. Tests spread it and change what they need. */
function myPaper(changes: Partial<MyPositionPaper> = {}): MyPositionPaper {
	return {
		conference: CONFERENCE,
		committee: {
			id: 'committee-1',
			slug: 'unsc',
			name: 'Security Council',
			heading: 'UNSC',
			topics: ['Climate finance']
		},
		seat: { id: 'seat-1', name: 'France', countryCode: 'FR' },
		document: PAPER,
		...changes
	};
}

/**
 * The few pieces of a request that this route actually reads.
 *
 * SvelteKit hands `load` and every action a great many more; the cast says
 * "this is enough", and anything the code reaches for that is missing fails
 * the test loudly.
 */
function makeEvent(formData?: FormData, search = ''): PageServerLoadEvent & RequestEvent {
	return {
		params: { slug: 'thimun-2027', committeeSlug: 'unsc' },
		url: new URL(
			`http://localhost/conferences/thimun-2027/committees/unsc/position-paper${search}`
		),
		locals: { supabase: SUPABASE },
		depends: vi.fn(),
		cookies: { set: vi.fn(), delete: vi.fn() },
		request: { formData: async () => formData ?? new FormData() }
	} as unknown as PageServerLoadEvent & RequestEvent;
}

/**
 * The redirect `requireOnboarded` throws at a visitor who is not signed in,
 * with this page as the one to come back to afterwards.
 */
function loginRedirect(): unknown {
	try {
		redirect(303, '/login?next=%2Fconferences%2Fthimun-2027%2Fcommittees%2Funsc%2Fposition-paper');
	} catch (thrown) {
		return thrown;
	}

	throw new Error('Nothing was thrown, so there is no redirect to hand on.');
}

/**
 * Run something that is expected to throw SvelteKit's `error` or `redirect`,
 * and give back what was thrown. Both work by throwing, so catching is the
 * only way to see what either of them said.
 */
async function catchThrown(
	run: () => unknown
): Promise<{ status: number; [key: string]: unknown }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; [key: string]: unknown };
	}

	throw new Error('Nothing was thrown, so nothing to check.');
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(getMyPositionPaper).mockResolvedValue(myPaper());
	vi.mocked(readPaperDraft).mockResolvedValue(null);
	vi.mocked(readPaperSharing).mockResolvedValue(null);
	vi.mocked(readLivePaperSetup).mockResolvedValue(null);
	// `clearAllMocks` keeps what a test told a stand-in to answer, so these start working again.
	vi.mocked(submitWrittenPaper).mockResolvedValue(undefined);
	vi.mocked(deletePaperDraft).mockResolvedValue(undefined);
});

/** A written paper that was submitted. Tests spread it and change what they need. */
const WRITTEN_PAPER: PositionPaperFile = {
	...PAPER,
	fileName: null,
	fileSizeBytes: null,
	downloadUrl: null,
	bodyMarkdown: 'France supports the treaty.',
	bodyHtml: '<p>France supports the treaty.</p>'
};

/** What the writing form posts: the text, the draft revision, and `background=1` for autosave. */
function writtenForm(body: string, revision = '0', isBackground = false): FormData {
	const formData = new FormData();
	formData.set('body', body);
	formData.set('revision', revision);
	if (isBackground) formData.set('background', '1');
	return formData;
}

/** What a refused written form answers with. */
type WritingRefusal = {
	status: number;
	data: {
		flash: { tone: string; message: string };
		draftText: string;
		draftConflict: { revision: number; theirs: { bodyHtml: string } | null } | null;
	};
};

describe('load', () => {
	it('sends a visitor who is not signed in to the sign in page, with this page to come back to', async () => {
		vi.mocked(requireOnboarded).mockRejectedValue(loginRedirect());

		const thrown = await catchThrown(() => load(makeEvent()));

		expect(thrown.status).toBe(303);
		expect(getMyPositionPaper).not.toHaveBeenCalled();
	});

	it('gives 404 to a delegate who holds no seat in this committee', async () => {
		vi.mocked(getMyPositionPaper).mockResolvedValue(null);

		const thrown = await catchThrown(() => load(makeEvent()));

		expect(thrown.status).toBe(404);
	});

	it('reads the paper of the signed-in reader, for this conference and committee', async () => {
		await load(makeEvent());

		expect(getMyPositionPaper).toHaveBeenCalledWith(SUPABASE, 'thimun-2027', 'unsc', 'user-1');
	});

	it('hands the paper on as `paper`, with the draft, the way and whether it is being edited', async () => {
		const page = myPaper();
		const draft = {
			body: 'Draft',
			revision: 3,
			updatedAt: '2026-09-27T10:00:00Z',
			updatedById: 'user-2',
			updatedByName: 'Rachel Morgan'
		};
		const sharing = { delegationName: "St Aidan's", members: [] };
		vi.mocked(getMyPositionPaper).mockResolvedValue(page);
		vi.mocked(readPaperDraft).mockResolvedValue(draft);
		vi.mocked(readPaperSharing).mockResolvedValue(sharing);
		// The paper is shared, so it is written live (T148).
		const live = {
			topic: 'paper:seat-1',
			documentState: null,
			openSuggestions: 0,
			writer: { id: 'user-1', name: 'Tom Price' },
			writers: [{ id: 'user-1', name: 'Tom Price' }]
		};
		vi.mocked(readLivePaperSetup).mockResolvedValue(live);

		const result = await load(makeEvent());

		expect(result).toEqual({
			paper: page,
			draft,
			sharing,
			readerId: 'user-1',
			way: 'upload',
			isEditing: false,
			live,
			// The upload side shows no margin, so no threads are read.
			threads: [],
			commentAddress: null,
			// The paper's own heading, from the seat, the committee and the conference.
			sheetHeading: {
				seatName: 'France',
				conferenceName: 'THIMUN 2027',
				lines: [
					{ label: 'Country', value: 'France' },
					{ label: 'Committee', value: 'Security Council' },
					{ label: 'Topic', value: 'Climate finance' }
				]
			}
		});
		expect(readLivePaperSetup).toHaveBeenCalledWith(SUPABASE, 'seat-1', sharing, 'user-1');
		expect(readPaperDraft).toHaveBeenCalledWith(SUPABASE, 'seat-1');
		// The delegation is looked up at the paper's conference, for the signed-in reader.
		expect(readPaperSharing).toHaveBeenCalledWith(SUPABASE, 'conference-1', 'user-1');
	});

	it("reads a shared paper's threads while it is written, naming no seats", async () => {
		const sharing = { delegationName: "St Aidan's", members: [] };
		vi.mocked(getMyPositionPaper).mockResolvedValue(myPaper({ document: null }));
		vi.mocked(readPaperSharing).mockResolvedValue(sharing);
		vi.mocked(readLivePaperSetup).mockResolvedValue({
			topic: 'paper:seat-1',
			documentState: null,
			openSuggestions: 0,
			writer: { id: 'user-1', name: 'Tom Price' },
			writers: [{ id: 'user-1', name: 'Tom Price' }]
		});

		await load(makeEvent(undefined, '?way=write'));

		expect(readPaperThreads).toHaveBeenCalledWith(
			SUPABASE,
			{ kind: 'position', seatId: 'seat-1' },
			{ id: 'user-1', committeeId: null, timeZone: 'Europe/Amsterdam' }
		);
		expect(markThreadNotificationsRead).toHaveBeenCalledWith(SUPABASE, 'user-1', []);
	});

	it('opens on writing for a written paper or none, and on the way the address names', async () => {
		vi.mocked(getMyPositionPaper).mockResolvedValue(myPaper({ document: WRITTEN_PAPER }));
		expect(await load(makeEvent())).toMatchObject({ way: 'write' });

		vi.mocked(getMyPositionPaper).mockResolvedValue(myPaper({ document: null }));
		expect(await load(makeEvent())).toMatchObject({ way: 'write' });

		expect(await load(makeEvent(undefined, '?way=upload&edit=1'))).toMatchObject({
			way: 'upload',
			isEditing: true
		});
	});
});

describe('actions.saveDraft', () => {
	it('answers an autosave with the new revision, without a redirect', async () => {
		vi.mocked(savePaperDraft).mockResolvedValue({ kind: 'saved', revision: 4 });

		const result = await actions.saveDraft(makeEvent(writtenForm('Line\r\nTwo', '3', true)));

		expect(result).toEqual({ draftSaved: { revision: 4 } });
		// Windows line ends are stored as plain ones.
		expect(savePaperDraft).toHaveBeenCalledWith(SUPABASE, {
			seatId: 'seat-1',
			body: 'Line\nTwo',
			baseRevision: 3
		});
	});

	it('sends "Save draft" without JavaScript back to the editor with a flash', async () => {
		vi.mocked(savePaperDraft).mockResolvedValue({ kind: 'saved', revision: 1 });

		const thrown = await catchThrown(() => actions.saveDraft(makeEvent(writtenForm('Text'))));

		expect(thrown).toMatchObject({
			status: 303,
			location: '/conferences/thimun-2027/committees/unsc/position-paper?way=write&edit=1'
		});
		expect(setFlash).toHaveBeenCalledWith(expect.anything(), {
			tone: 'success',
			message: PAPER_WRITING_MESSAGES.draftSaved
		});
	});

	it('hands the text back with the draft saved first, made safe to draw', async () => {
		const theirs = {
			body: 'Theirs **now**',
			revision: 6,
			updatedAt: '2026-09-27T10:00:00Z',
			updatedById: 'user-2',
			updatedByName: 'Rachel Morgan'
		};
		vi.mocked(savePaperDraft).mockResolvedValue({ kind: 'conflict', revision: 6, theirs });

		const result = (await actions.saveDraft(
			makeEvent(writtenForm('Mine', '5'))
		)) as unknown as WritingRefusal;

		expect(result.status).toBe(409);
		expect(result.data.draftText).toBe('Mine');
		expect(result.data.draftConflict).toEqual({
			revision: 6,
			theirs: { ...theirs, bodyHtml: expect.stringContaining('<strong>now</strong>') }
		});
	});

	it('refuses a draft over the limit, or a form without a revision, without saving', async () => {
		const tooLong = 'a'.repeat(100_001);
		const refusedLong = (await actions.saveDraft(
			makeEvent(writtenForm(tooLong))
		)) as unknown as WritingRefusal;
		const refusedRevision = (await actions.saveDraft(
			makeEvent(writtenForm('Text', 'x'))
		)) as unknown as WritingRefusal;

		expect(refusedLong.data.flash.message).toBe(PAPER_WRITING_MESSAGES.tooLong);
		expect(refusedRevision.data.flash.message).toBe(PAPER_WRITING_MESSAGES.revision);
		expect(savePaperDraft).not.toHaveBeenCalled();
	});

	it('keeps the text when the database fails', async () => {
		vi.mocked(savePaperDraft).mockRejectedValue(new Error('down'));

		const result = (await actions.saveDraft(
			makeEvent(writtenForm('Text'))
		)) as unknown as WritingRefusal;

		expect(result.status).toBe(500);
		expect(result.data.draftText).toBe('Text');
	});
});

describe('actions.submitWritten', () => {
	it('submits the text for this seat, drops the draft and goes back to the page', async () => {
		const thrown = await catchThrown(() =>
			actions.submitWritten(makeEvent(writtenForm('France supports it.')))
		);

		expect(submitWrittenPaper).toHaveBeenCalledWith(SUPABASE, {
			conferenceId: 'conference-1',
			committeeId: 'committee-1',
			seatId: 'seat-1',
			userId: 'user-1',
			seatName: 'France',
			committeeHeading: 'UNSC',
			body: 'France supports it.'
		});
		expect(deletePaperDraft).toHaveBeenCalledWith(SUPABASE, 'seat-1');
		expect(setFlash).toHaveBeenCalledWith(expect.anything(), {
			tone: 'success',
			message: PAPER_WRITING_MESSAGES.submitted
		});
		expect(thrown.status).toBe(303);
	});

	it('refuses a blank paper and keeps what was sent', async () => {
		const result = (await actions.submitWritten(
			makeEvent(writtenForm('  '))
		)) as unknown as WritingRefusal;

		expect(result.data.flash.message).toBe(PAPER_WRITING_MESSAGES.empty);
		expect(submitWrittenPaper).not.toHaveBeenCalled();
	});

	it('refuses after the deadline, as an upload is refused', async () => {
		vi.mocked(getMyPositionPaper).mockResolvedValue(
			myPaper({ conference: { ...CONFERENCE, positionPaperDeadline: '2020-01-01T00:00:00Z' } })
		);

		const result = (await actions.submitWritten(
			makeEvent(writtenForm('Text'))
		)) as unknown as WritingRefusal;

		expect(result.status).toBe(400);
		expect(result.data.draftText).toBe('Text');
		expect(submitWrittenPaper).not.toHaveBeenCalled();
	});

	it('refuses to send the chair back the very text they asked to have changed', async () => {
		vi.mocked(getMyPositionPaper).mockResolvedValue(
			myPaper({ document: { ...WRITTEN_PAPER, reviewStatus: 'changes_requested' } })
		);

		const result = (await actions.submitWritten(
			makeEvent(writtenForm('France supports the treaty.'))
		)) as unknown as WritingRefusal;

		expect(result.data.flash.message).toBe(PAPER_WRITING_MESSAGES.unchanged);
		expect(submitWrittenPaper).not.toHaveBeenCalled();
	});

	it('keeps the draft and the text when the database refuses the paper', async () => {
		vi.mocked(submitWrittenPaper).mockRejectedValue(new Error('refused'));

		const result = (await actions.submitWritten(
			makeEvent(writtenForm('Text'))
		)) as unknown as WritingRefusal;

		expect(result.status).toBe(500);
		expect(result.data.draftText).toBe('Text');
		expect(deletePaperDraft).not.toHaveBeenCalled();
	});

	it('still counts as submitted when the draft cannot be dropped', async () => {
		vi.mocked(deletePaperDraft).mockRejectedValue(new Error('down'));

		const thrown = await catchThrown(() => actions.submitWritten(makeEvent(writtenForm('Text'))));

		expect(thrown.status).toBe(303);
	});
});

describe('actions.upload', () => {
	/** A form carrying one PDF under the `file` field, the way the real page posts it. */
	function uploadForm(file: File): FormData {
		const formData = new FormData();
		formData.set('file', file);
		return formData;
	}

	const PDF = new File(['a position paper'], 'france.pdf', { type: 'application/pdf' });

	it('gives 404 to a delegate who holds no seat in this committee', async () => {
		vi.mocked(getMyPositionPaper).mockResolvedValue(null);

		const thrown = await catchThrown(() => actions.upload(makeEvent(uploadForm(PDF))));

		expect(thrown.status).toBe(404);
		expect(uploadPositionPaper).not.toHaveBeenCalled();
	});

	it('refuses without uploading when the deadline has passed and the chair has not asked for changes', async () => {
		vi.mocked(getMyPositionPaper).mockResolvedValue(
			myPaper({
				conference: { ...CONFERENCE, positionPaperDeadline: '2020-01-01T00:00:00Z' },
				document: { ...PAPER, reviewStatus: 'submitted' }
			})
		);

		const result = (await actions.upload(makeEvent(uploadForm(PDF)))) as { status: number };

		expect(result.status).toBe(400);
		expect(uploadPositionPaper).not.toHaveBeenCalled();
	});

	it('lets a replacement through when the chair asked for changes, even after the deadline', async () => {
		vi.mocked(getMyPositionPaper).mockResolvedValue(
			myPaper({
				conference: { ...CONFERENCE, positionPaperDeadline: '2020-01-01T00:00:00Z' },
				document: { ...PAPER, reviewStatus: 'changes_requested' }
			})
		);

		await catchThrown(() => actions.upload(makeEvent(uploadForm(PDF))));

		expect(uploadPositionPaper).toHaveBeenCalled();
	});

	it('refuses a file that is not a PDF, without uploading it', async () => {
		const wordDocument = new File(['not a pdf'], 'france.docx', {
			type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		});

		const result = (await actions.upload(makeEvent(uploadForm(wordDocument)))) as {
			status: number;
			data: { error: string };
		};

		expect(result.status).toBe(400);
		expect(result.data.error).toBe('Please upload a PDF.');
		expect(uploadPositionPaper).not.toHaveBeenCalled();
	});

	it('refuses with "Please choose a file." when the box was left empty', async () => {
		const result = (await actions.upload(makeEvent(new FormData()))) as {
			status: number;
			data: { error: string };
		};

		expect(result.data.error).toBe('Please choose a file.');
		expect(uploadPositionPaper).not.toHaveBeenCalled();
	});

	it('uploads a valid PDF with the reader, the seat and the committee it belongs to', async () => {
		await catchThrown(() => actions.upload(makeEvent(uploadForm(PDF))));

		expect(uploadPositionPaper).toHaveBeenCalledWith(SUPABASE, {
			conferenceId: 'conference-1',
			committeeId: 'committee-1',
			seatId: 'seat-1',
			userId: 'user-1',
			seatName: 'France',
			committeeHeading: 'UNSC',
			file: PDF
		});
	});

	it('leaves a flash message and sends the reader back to the page on success', async () => {
		const thrown = await catchThrown(() => actions.upload(makeEvent(uploadForm(PDF))));

		expect(setFlash).toHaveBeenCalledWith(expect.anything(), {
			tone: 'success',
			message: 'Position paper uploaded.'
		});
		expect(thrown.status).toBe(303);
	});

	it('answers with a plain message rather than throwing when Storage fails', async () => {
		vi.mocked(uploadPositionPaper).mockRejectedValue(new Error('bucket is full'));

		const result = (await actions.upload(makeEvent(uploadForm(PDF)))) as {
			status: number;
			data: { error: string };
		};

		expect(result.status).toBe(500);
		expect(result.data.error).toBe('Something went wrong on our side. Please try again.');
	});
});

describe('actions.remove', () => {
	it('gives 404 to a delegate who holds no seat in this committee', async () => {
		vi.mocked(getMyPositionPaper).mockResolvedValue(null);

		const thrown = await catchThrown(() => actions.remove(makeEvent()));

		expect(thrown.status).toBe(404);
		expect(removePositionPaper).not.toHaveBeenCalled();
	});

	it('refuses without deleting anything when there is no paper to remove', async () => {
		vi.mocked(getMyPositionPaper).mockResolvedValue(myPaper({ document: null }));

		const result = (await actions.remove(makeEvent())) as { status: number };

		expect(result.status).toBe(400);
		expect(removePositionPaper).not.toHaveBeenCalled();
	});

	it('refuses a paper that has already been approved', async () => {
		vi.mocked(getMyPositionPaper).mockResolvedValue(
			myPaper({ document: { ...PAPER, reviewStatus: 'approved' } })
		);

		const result = (await actions.remove(makeEvent())) as { status: number };

		expect(result.status).toBe(400);
		expect(removePositionPaper).not.toHaveBeenCalled();
	});

	it('deletes the paper this seat has, by its id', async () => {
		vi.mocked(removePositionPaper).mockResolvedValue(true);

		await catchThrown(() => actions.remove(makeEvent()));

		expect(removePositionPaper).toHaveBeenCalledWith(SUPABASE, 'paper-1');
	});

	it('leaves a flash message and sends the reader back to the page on success', async () => {
		vi.mocked(removePositionPaper).mockResolvedValue(true);

		const thrown = await catchThrown(() => actions.remove(makeEvent()));

		expect(setFlash).toHaveBeenCalledWith(expect.anything(), {
			tone: 'success',
			message: 'Position paper removed.'
		});
		expect(thrown.status).toBe(303);
	});

	it('refuses when Row Level Security has refused the delete between the two requests', async () => {
		vi.mocked(removePositionPaper).mockResolvedValue(false);

		const result = (await actions.remove(makeEvent())) as { status: number };

		expect(result.status).toBe(400);
	});
});

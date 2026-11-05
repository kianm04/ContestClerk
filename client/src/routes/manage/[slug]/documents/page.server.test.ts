import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { Conference } from '$lib/conferences';
import type { PaperCommitteeRow, PaperSeatRow } from '$lib/documents-page';
import type { CommitteeGuide } from '$lib/documents';

// The gate, the queries and the flash cookie are stood in for, so these tests
// are about what `load` and the seven actions decide. What the database allows
// is tested in `tests/db/documents.test.ts`. `$lib/documents-page` and
// `$lib/documents` are deliberately real: the messages checked below are the
// ones the organiser sees.
vi.mock('$lib/server/access', () => ({ requirePermission: vi.fn(), requireManagePage: vi.fn() }));

vi.mock('$lib/server/documents', () => ({
	listBackgroundGuides: vi.fn(),
	uploadBackgroundGuide: vi.fn()
}));

vi.mock('$lib/server/paper-reviews', () => ({
	approvePositionPapers: vi.fn(),
	listPaperSeats: vi.fn(),
	positionPaperOverview: vi.fn(),
	reviewPositionPaper: vi.fn()
}));

vi.mock('$lib/server/resources', () => ({
	deleteDocument: vi.fn(),
	listResources: vi.fn(),
	updateDocumentAudience: vi.fn(),
	uploadResource: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireManagePage, requirePermission } from '$lib/server/access';
import { listBackgroundGuides, uploadBackgroundGuide } from '$lib/server/documents';
import { setFlash } from '$lib/server/flash';
import {
	approvePositionPapers,
	listPaperSeats,
	positionPaperOverview,
	reviewPositionPaper
} from '$lib/server/paper-reviews';
import {
	deleteDocument,
	listResources,
	updateDocumentAudience,
	uploadResource
} from '$lib/server/resources';
import type { MyPermissions } from '$lib/permissions';

/** What the layout hands down for an organiser: `administrator` opens every page. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** The Supabase client. `load` and the actions only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

const SIGNED_IN_USER = { id: 'user-1', email: 'sara@example.com' };

const CONFERENCE = {
	id: 'conference-1',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	timezone: 'Europe/Amsterdam'
} as unknown as Conference;

/** The Security Council, without a guide yet. */
const UNSC_GUIDE: CommitteeGuide = { committeeId: 'unsc', committeeHeading: 'UNSC', guide: null };

/** The Security Council's line in the papers table. */
const UNSC_PAPERS: PaperCommitteeRow = {
	committeeId: 'unsc',
	committeeSlug: 'unsc',
	committeeHeading: 'UNSC',
	filledSeatCount: 2,
	counts: { missing: 1, submitted: 0, approved: 1, changes_requested: 0 }
};

/** A seat of the Security Council, at `status`. */
function makeSeat(seatId: string, status: PaperSeatRow['status']): PaperSeatRow {
	return {
		seatId,
		seatName: seatId,
		countryCode: null,
		delegateName: 'A delegate',
		delegateAvatarPath: null,
		status,
		paper: null
	};
}

/** The page every redirecting action comes back to. */
const PAGE_PATH = '/manage/riverside-mun-2027/documents';

/** The few pieces of a request that `load` and the actions here actually read. */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${PAGE_PATH}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/** That stand-in, as the `load` function's own event type. */
function makeLoadEvent(
	search: string = '',
	permissions: MyPermissions = ADMINISTRATOR
): PageServerLoadEvent {
	return makeEvent({
		url: new URL(`http://localhost${PAGE_PATH}${search}`),
		parent: async () => ({ conference: CONFERENCE, permissions })
	}) as unknown as PageServerLoadEvent;
}

/** A post to one of the actions, with `search` in the action's own address. */
function makeActionEvent(search: string, formData: FormData = new FormData()): RequestEvent {
	return makeEvent({
		url: new URL(`http://localhost${PAGE_PATH}${search}`),
		request: { formData: async () => formData }
	}) as unknown as RequestEvent;
}

/** Form fields as a `FormData`. A `File` value is sent as a file. */
function makeForm(fields: Record<string, string | File>): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return formData;
}

/** A file of `size` bytes and `type`. */
function makeFile(name: string, type: string, size = 100): File {
	return new File([new Uint8Array(size)], name, { type });
}

/** `redirect` and `error` throw rather than return, so this catches what was thrown. */
async function catchThrown(run: () => unknown): Promise<{ status: number; location?: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location?: string };
	}

	throw new Error('Nothing was thrown.');
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requirePermission).mockResolvedValue({ user: SIGNED_IN_USER, conference: CONFERENCE });
	vi.mocked(listResources).mockResolvedValue([]);
	vi.mocked(listBackgroundGuides).mockResolvedValue([UNSC_GUIDE]);
	vi.mocked(positionPaperOverview).mockResolvedValue([UNSC_PAPERS]);
	vi.mocked(listPaperSeats).mockResolvedValue([
		makeSeat('a', 'missing'),
		makeSeat('b', 'approved')
	]);
	vi.mocked(updateDocumentAudience).mockResolvedValue(true);
	vi.mocked(deleteDocument).mockResolvedValue(true);
	vi.mocked(reviewPositionPaper).mockResolvedValue(true);
	vi.mocked(approvePositionPapers).mockResolvedValue(1);
});

describe('load', () => {
	it('asks the permissions the layout read whether this page opens for the reader', async () => {
		await load(makeLoadEvent());

		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'documents');
	});

	it('reads all three tabs, and no seats before a committee is chosen', async () => {
		const data = (await load(makeLoadEvent())) as Record<string, unknown>;

		expect(data.view).toMatchObject({ tab: 'resources' });
		expect(data.guides).toEqual([UNSC_GUIDE]);
		expect(data.paperCommittees).toEqual([UNSC_PAPERS]);
		expect(data.selectedCommittee).toBeNull();
		expect(data.paperSeats).toEqual([]);
		expect(listPaperSeats).not.toHaveBeenCalled();
	});

	it('shows a documents manager the shared files alone, whatever the address asks', async () => {
		const documentsManager: MyPermissions = {
			held: [{ permission: 'manage_documents', scope: 'conference' }],
			committeeIds: [],
			rank: 1
		};

		const data = (await load(
			makeLoadEvent('?tab=papers&committee=unsc', documentsManager)
		)) as Record<string, unknown>;

		expect(data.canSeeCommitteeDocuments).toBe(false);
		expect(data.view).toMatchObject({ tab: 'resources', committeeId: null });
		expect(data.guides).toEqual([]);
		expect(listBackgroundGuides).not.toHaveBeenCalled();
		expect(positionPaperOverview).not.toHaveBeenCalled();
		expect(listPaperSeats).not.toHaveBeenCalled();
	});

	it('lists the chosen committee’s seats, filtered by the address', async () => {
		const data = (await load(makeLoadEvent('?tab=papers&committee=unsc&paper=missing'))) as Record<
			string,
			unknown
		>;

		expect(data.selectedCommittee).toEqual(UNSC_PAPERS);
		expect(listPaperSeats).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, 'unsc');
		expect((data.paperSeats as PaperSeatRow[]).map((seat) => seat.seatId)).toEqual(['a']);
	});

	it('lists no seats for a committee that is not this conference’s', async () => {
		const data = (await load(makeLoadEvent('?tab=papers&committee=elsewhere'))) as Record<
			string,
			unknown
		>;

		expect(data.selectedCommittee).toBeNull();
		expect(listPaperSeats).not.toHaveBeenCalled();
	});
});

describe('the uploadResource action', () => {
	it('uploads the file and says so', async () => {
		const file = makeFile('map.pdf', 'application/pdf');
		const redirect = await catchThrown(() =>
			actions.uploadResource(
				makeActionEvent('?/uploadResource', makeForm({ title: 'Map', audience: 'everyone', file }))
			)
		);

		expect(uploadResource).toHaveBeenCalledWith(SUPABASE, {
			conferenceId: CONFERENCE.id,
			uploadedBy: SIGNED_IN_USER.id,
			title: 'Map',
			file,
			audience: 'everyone'
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Resource uploaded.'
		});
		expect(redirect).toMatchObject({ status: 303, location: PAGE_PATH });
	});

	it('refuses a file over 20 MB before anything is uploaded, keeping the title', async () => {
		const file = makeFile('huge.pdf', 'application/pdf', 21 * 1024 * 1024);
		const result = await actions.uploadResource(
			makeActionEvent('?/uploadResource', makeForm({ title: 'Map', audience: 'staff', file }))
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				resourceValues: { title: 'Map', audience: 'staff' },
				resourceErrors: { file: 'The file is larger than 20 MB.' }
			}
		});
		expect(uploadResource).not.toHaveBeenCalled();
	});

	it('refuses the wrong type and a missing title', async () => {
		const file = makeFile('slides.zip', 'application/zip');
		const result = await actions.uploadResource(
			makeActionEvent('?/uploadResource', makeForm({ title: '', audience: 'staff', file }))
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				resourceErrors: {
					title: 'Please give the file a title.',
					file: 'Resources can be a PDF, an image or a Word document.'
				}
			}
		});
	});

	it('says the upload failed when Storage refuses it', async () => {
		vi.mocked(uploadResource).mockRejectedValueOnce(new Error('bucket full'));
		const file = makeFile('map.pdf', 'application/pdf');

		const result = await actions.uploadResource(
			makeActionEvent('?/uploadResource', makeForm({ title: 'Map', audience: 'everyone', file }))
		);

		expect(result).toMatchObject({
			status: 500,
			data: { message: 'The upload failed. Please try again.' }
		});
	});

	it('asks for manage_documents again', async () => {
		vi.mocked(requirePermission).mockRejectedValueOnce({ status: 404 });

		const thrown = await catchThrown(() =>
			actions.uploadResource(makeActionEvent('?/uploadResource'))
		);

		expect(thrown).toMatchObject({ status: 404 });
		expect(requirePermission).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			CONFERENCE.slug,
			'manage_documents'
		);
		expect(uploadResource).not.toHaveBeenCalled();
	});
});

describe('the updateResourceAudience action', () => {
	it('changes the audience and says so', async () => {
		const redirect = await catchThrown(() =>
			actions.updateResourceAudience(
				makeActionEvent(
					'?/updateResourceAudience',
					makeForm({ documentId: 'resource-1', audience: 'staff' })
				)
			)
		);

		expect(updateDocumentAudience).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			'resource-1',
			'staff'
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Audience changed.'
		});
		expect(redirect).toMatchObject({ status: 303 });
	});

	it('refuses an audience that does not exist', async () => {
		const result = await actions.updateResourceAudience(
			makeActionEvent(
				'?/updateResourceAudience',
				makeForm({ documentId: 'resource-1', audience: 'chairs' })
			)
		);

		expect(result).toMatchObject({ status: 400 });
		expect(updateDocumentAudience).not.toHaveBeenCalled();
	});
});

describe('the deleteDocument action', () => {
	it('deletes a confirmed file and goes back to the tab it was on', async () => {
		const redirect = await catchThrown(() =>
			actions.deleteDocument(
				makeActionEvent('?tab=guides&/deleteDocument', makeForm({ documentId: 'g', confirm: '1' }))
			)
		);

		expect(deleteDocument).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, 'g');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'File deleted.' });
		expect(redirect).toMatchObject({ status: 303, location: `${PAGE_PATH}?tab=guides` });
	});

	it('refuses an unconfirmed delete', async () => {
		const result = await actions.deleteDocument(
			makeActionEvent('?/deleteDocument', makeForm({ documentId: 'g' }))
		);

		expect(result).toMatchObject({ status: 400 });
		expect(deleteDocument).not.toHaveBeenCalled();
	});
});

describe('the uploadBackgroundGuide action', () => {
	it('uploads a PDF titled with the committee abbreviation', async () => {
		const file = makeFile('unsc.pdf', 'application/pdf');
		const redirect = await catchThrown(() =>
			actions.uploadBackgroundGuide(
				makeActionEvent(
					'?tab=guides&/uploadBackgroundGuide',
					makeForm({ committeeId: 'unsc', audience: 'everyone', file })
				)
			)
		);

		expect(uploadBackgroundGuide).toHaveBeenCalledWith(SUPABASE, {
			conferenceId: CONFERENCE.id,
			committeeId: 'unsc',
			uploadedBy: SIGNED_IN_USER.id,
			title: 'UNSC background guide',
			file,
			audience: 'everyone'
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Background guide uploaded for UNSC.'
		});
		expect(redirect).toMatchObject({ status: 303, location: `${PAGE_PATH}?tab=guides` });
	});

	it('refuses anything but a PDF under that committee', async () => {
		const file = makeFile('unsc.docx', 'application/msword');
		const result = await actions.uploadBackgroundGuide(
			makeActionEvent(
				'?tab=guides&/uploadBackgroundGuide',
				makeForm({ committeeId: 'unsc', audience: 'everyone', file })
			)
		);

		expect(result).toMatchObject({
			status: 400,
			data: { guideCommitteeId: 'unsc', guideError: 'Background guides must be a PDF.' }
		});
		expect(uploadBackgroundGuide).not.toHaveBeenCalled();
	});

	it('answers 404 for a committee from another conference', async () => {
		const file = makeFile('x.pdf', 'application/pdf');
		const result = await actions.uploadBackgroundGuide(
			makeActionEvent(
				'?tab=guides&/uploadBackgroundGuide',
				makeForm({ committeeId: 'elsewhere', audience: 'everyone', file })
			)
		);

		expect(result).toMatchObject({ status: 404 });
		expect(uploadBackgroundGuide).not.toHaveBeenCalled();
	});
});

describe('the approvePaper and bulkApprovePapers actions', () => {
	const VIEW = '?tab=papers&committee=unsc';

	it('approves the paper named in the action address', async () => {
		const redirect = await catchThrown(() =>
			actions.approvePaper(makeActionEvent(`${VIEW}&/approvePaper&documentId=paper-1`))
		);

		expect(approvePositionPapers).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			['paper-1'],
			SIGNED_IN_USER.id
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Approved.' });
		expect(redirect).toMatchObject({ status: 303, location: `${PAGE_PATH}${VIEW}` });
	});

	it('approves every ticked paper and counts them', async () => {
		vi.mocked(approvePositionPapers).mockResolvedValueOnce(2);
		const formData = new FormData();
		formData.append('ids', 'paper-1');
		formData.append('ids', 'paper-2');

		await catchThrown(() =>
			actions.bulkApprovePapers(makeActionEvent(`${VIEW}&/bulkApprovePapers`, formData))
		);

		expect(approvePositionPapers).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			['paper-1', 'paper-2'],
			SIGNED_IN_USER.id
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: '2 papers approved.'
		});
	});

	it('asks for a tick before approving nothing', async () => {
		const result = await actions.bulkApprovePapers(makeActionEvent(`${VIEW}&/bulkApprovePapers`));

		expect(result).toMatchObject({
			status: 400,
			data: { message: 'Tick at least one paper to approve.' }
		});
	});
});

describe('the requestChanges action', () => {
	const VIEW = '?tab=papers&committee=unsc&review=paper-1';

	it('sends the paper back with the comment and closes the form', async () => {
		const redirect = await catchThrown(() =>
			actions.requestChanges(
				makeActionEvent(
					`${VIEW}&/requestChanges`,
					makeForm({ documentId: 'paper-1', reviewComment: 'Cite your sources.' })
				)
			)
		);

		expect(reviewPositionPaper).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			'paper-1',
			{ status: 'changes_requested', comment: 'Cite your sources.' },
			SIGNED_IN_USER.id
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Changes requested. The delegate has been notified.'
		});
		expect(redirect).toMatchObject({
			status: 303,
			location: `${PAGE_PATH}?tab=papers&committee=unsc`
		});
	});

	it('refuses an empty comment with the stated message', async () => {
		const result = await actions.requestChanges(
			makeActionEvent(
				`${VIEW}&/requestChanges`,
				makeForm({ documentId: 'paper-1', reviewComment: '   ' })
			)
		);

		expect(result).toMatchObject({
			status: 400,
			data: { reviewError: 'Tell the delegate what to change.' }
		});
		expect(reviewPositionPaper).not.toHaveBeenCalled();
	});
});

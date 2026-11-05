import { describe, expect, it } from 'vitest';
import type { CommitteeGuide, ResourceFile } from '$lib/documents';
import { rowsAfterPresses, type PressedForm } from '$lib/row-changes';
import {
	describeDocumentDeleteFailure,
	describeResourceFailure,
	expectGuideDeleted,
	expectResourceAudienceChange,
	expectResourceDeleted,
	withCommitteeId,
	type GuideRow
} from './document-delete-presses';

/** A press of `?/deleteDocument`, naming `documentId`, as `use:enhance` hands it over. */
function deletePress(documentId: string): PressedForm {
	const action = new URL(
		'http://localhost/manage/riverside-2027/documents?tab=guides&/deleteDocument'
	);
	const formData = new FormData();
	formData.set('documentId', documentId);
	formData.set('confirm', '1');

	return { action, formData };
}

function makeGuide(overrides: Partial<CommitteeGuide> = {}): CommitteeGuide {
	return {
		committeeId: 'committee-1',
		committeeHeading: 'DISEC',
		guide: {
			id: 'guide-1',
			title: 'DISEC background guide',
			fileName: 'disec.pdf',
			fileSizeBytes: 1024,
			audience: 'delegates',
			downloadUrl: null
		},
		...overrides
	};
}

function makeResource(overrides: Partial<ResourceFile> = {}): ResourceFile {
	return {
		id: 'resource-1',
		title: 'Venue map',
		fileName: 'map.pdf',
		fileSizeBytes: 2048,
		mimeType: 'application/pdf',
		audience: 'everyone',
		createdAt: '2026-02-12T10:00:00Z',
		uploaderName: 'Jamie Chen',
		downloadUrl: null,
		...overrides
	};
}

describe('expectGuideDeleted', () => {
	it('leaves the committee with no guide', () => {
		const rows: GuideRow[] = [makeGuide()].map(withCommitteeId);
		const input = deletePress('guide-1');

		const shown = rowsAfterPresses(rows, [
			{
				id: 1,
				formData: input.formData,
				action: input.action,
				expected: expectGuideDeleted(input, rows)
			}
		]);

		expect(shown[0].guide).toBeNull();
	});

	it('leaves a press naming no guide of this list alone', () => {
		const rows: GuideRow[] = [makeGuide()].map(withCommitteeId);

		expect(expectGuideDeleted(deletePress('no-such-guide'), rows)).toBeNull();
	});

	it('says null for a press this form does not predict', () => {
		const rows: GuideRow[] = [makeGuide()].map(withCommitteeId);
		const input: PressedForm = {
			action: new URL(
				'http://localhost/manage/riverside-2027/documents?tab=guides&/uploadBackgroundGuide'
			),
			formData: new FormData()
		};

		expect(expectGuideDeleted(input, rows)).toBeNull();
	});
});

describe('expectResourceDeleted', () => {
	it('takes the resource off the list', () => {
		const rows = [makeResource()];
		const input = deletePress('resource-1');

		const shown = rowsAfterPresses(rows, [
			{
				id: 1,
				formData: input.formData,
				action: input.action,
				expected: expectResourceDeleted(input, rows)
			}
		]);

		expect(shown).toHaveLength(0);
	});

	it('leaves a press naming no resource of this list alone', () => {
		const rows = [makeResource()];

		expect(expectResourceDeleted(deletePress('no-such-resource'), rows)).toBeNull();
	});
});

describe('describeDocumentDeleteFailure', () => {
	it('names what did not happen', () => {
		expect(describeDocumentDeleteFailure()).toBe('The file was not deleted.');
	});
});

describe('expectResourceAudienceChange', () => {
	/** A press of `?/updateResourceAudience` for `documentId`, with `audience` picked. */
	function audiencePress(documentId: string, audience: string): PressedForm {
		const action = new URL(
			'http://localhost/manage/riverside-2027/documents?/updateResourceAudience'
		);
		const formData = new FormData();
		formData.set('documentId', documentId);
		formData.set('audience', audience);

		return { action, formData };
	}

	it('sets the new audience on the resource the press names', () => {
		const resource = makeResource();
		const changes = expectResourceAudienceChange(audiencePress(resource.id, 'staff'), [resource]);

		expect(changes).toEqual([{ id: resource.id, changes: { audience: 'staff' } }]);
	});

	it('expects nothing for an unknown resource, an unknown audience or a deletion', () => {
		const resource = makeResource();

		expect(expectResourceAudienceChange(audiencePress('other', 'staff'), [resource])).toBeNull();
		expect(
			expectResourceAudienceChange(audiencePress(resource.id, 'kings'), [resource])
		).toBeNull();
		expect(expectResourceAudienceChange(deletePress(resource.id), [resource])).toBeNull();
	});

	it('names what did not happen for each press', () => {
		const audience = { id: 1, ...audiencePress('resource-1', 'staff'), expected: null };
		const deletion = { id: 2, ...deletePress('resource-1'), expected: null };

		expect(describeResourceFailure(audience)).toBe('The audience was not changed.');
		expect(describeResourceFailure(deletion)).toBe('The file was not deleted.');
	});
});

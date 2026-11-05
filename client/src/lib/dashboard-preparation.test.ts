import { describe, expect, it } from 'vitest';
import { SAMPLE_COMMITTEE } from './dashboard-attention-samples';
import { preparationItems } from './dashboard-preparation';

describe('preparationItems', () => {
	it('ticks a public programme and uploaded guides, and always asks about registration', () => {
		expect(preparationItems([SAMPLE_COMMITTEE], true, 'northbridge')).toEqual([
			{ key: 'programme', text: 'Programme is public', isDone: true, link: null },
			{ key: 'guides', text: 'Background guides uploaded', isDone: true, link: null },
			{
				key: 'register',
				text: 'Tell delegates where to register',
				isDone: false,
				link: { label: 'Write announcement', href: '/manage/northbridge/announcements' }
			}
		]);
	});

	it('links to the work while the programme is hidden and guides are missing', () => {
		const withoutGuide = { ...SAMPLE_COMMITTEE, hasBackgroundGuide: false };
		const [programme, guides] = preparationItems([withoutGuide], false, 'northbridge');

		expect(programme).toEqual({
			key: 'programme',
			text: 'Make the programme public',
			isDone: false,
			link: { label: 'Schedule', href: '/manage/northbridge/schedule' }
		});
		expect(guides.text).toBe('1 committee has no background guide');
		expect(guides.link?.href).toBe('/manage/northbridge/documents?tab=guides');
	});

	it('leaves the guides out when there is no committee', () => {
		const keys = preparationItems([], true, 'northbridge').map((item) => item.key);

		expect(keys).toEqual(['programme', 'register']);
	});
});

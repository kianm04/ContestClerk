import { describe, expect, it } from 'vitest';
import { awardsSummary, publishAwardsLabel, unconfirmedAwardsText } from './organiser-awards-text';

describe('awardsSummary', () => {
	it('counts the awards and says they are not published yet', () => {
		expect(awardsSummary({ confirmed: 2, proposed: 3 }, null)).toBe(
			'2 confirmed · 3 proposed · not published yet'
		);
	});

	it('says when the awards were published', () => {
		expect(awardsSummary({ confirmed: 2, proposed: 0 }, '15 Feb 2027, 17:00')).toBe(
			'2 confirmed · 0 proposed · published 15 Feb 2027, 17:00'
		);
	});
});

describe('publishAwardsLabel', () => {
	it('says how many awards a press publishes', () => {
		expect(publishAwardsLabel(1)).toBe('Publish 1 award');
		expect(publishAwardsLabel(12)).toBe('Publish 12 awards');
	});

	it('has no number while nothing is confirmed', () => {
		expect(publishAwardsLabel(0)).toBe('Publish awards');
	});
});

describe('unconfirmedAwardsText', () => {
	it('says how many proposals publishing would leave out', () => {
		expect(unconfirmedAwardsText(1)).toBe('1 award is still unconfirmed.');
		expect(unconfirmedAwardsText(3)).toBe('3 awards are still unconfirmed.');
	});

	it('says nothing when every award is confirmed', () => {
		expect(unconfirmedAwardsText(0)).toBeNull();
	});
});

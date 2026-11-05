import { describe, expect, it } from 'vitest';
import {
	CONSOLE_VIEWS,
	isLiveStripShown,
	isModeBarShown,
	isSuspendShown,
	liveView,
	modeBarTabs,
	motionPassLanding,
	readFromView,
	selectedView,
	tabRoute,
	type LiveStripFacts
} from './live-mode';

describe('CONSOLE_VIEWS', () => {
	it("lists the six views in myMUN's order with keys 1 to 6", () => {
		const labels = CONSOLE_VIEWS.map((details) => details.label);
		const keys = CONSOLE_VIEWS.map((details) => details.keyShortcut);

		expect(labels).toEqual(['GSL', 'Motions', 'Mod', 'Unmod', 'Single speaker', 'Vote']);
		expect(keys).toEqual(['1', '2', '3', '4', '5', '6']);
	});

	it('gives each view its Lucide icon and a short label for a phone', () => {
		const icons = CONSOLE_VIEWS.map((details) => details.icon);
		const shortLabels = CONSOLE_VIEWS.map((details) => details.shortLabel);

		expect(icons).toEqual(['list-ordered', 'hand', 'messages-square', 'users', 'mic', 'vote']);
		expect(shortLabels).toEqual(['GSL', 'Motions', 'Mod', 'Unmod', 'Single', 'Vote']);
	});
});

describe('liveView', () => {
	it('names the view each mode draws', () => {
		expect(liveView('formal_debate')).toBe('gsl');
		expect(liveView('moderated_caucus')).toBe('mod');
		expect(liveView('unmoderated_caucus')).toBe('unmod');
		expect(liveView('single_speaker')).toBe('single');
		expect(liveView('voting')).toBe('voting');
	});

	it('is null with no session running or while suspended', () => {
		expect(liveView('idle')).toBeNull();
		expect(liveView('suspended')).toBeNull();
	});
});

describe('selectedView', () => {
	it('is the live view on chair, the live room', () => {
		expect(selectedView('chair', 'mod')).toBe('mod');
	});

	it('is nothing on chair while no view is live', () => {
		expect(selectedView('chair', null)).toBeNull();
	});

	it("is the view's own route, whatever is live", () => {
		expect(selectedView('motions', 'gsl')).toBe('motions');
		expect(selectedView('voting', null)).toBe('voting');
	});

	it('is nothing on the roll call, Papers, Notes and Awards', () => {
		expect(selectedView('roll-call', 'gsl')).toBeNull();
		expect(selectedView('papers', 'gsl')).toBeNull();
		expect(selectedView('notes', 'gsl')).toBeNull();
		expect(selectedView('awards', 'gsl')).toBeNull();
	});
});

describe('tabRoute', () => {
	it('links the live view to chair and every other view to its own route', () => {
		expect(tabRoute('gsl', 'gsl')).toBe('chair');
		expect(tabRoute('mod', 'gsl')).toBe('mod');
		expect(tabRoute('gsl', null)).toBe('gsl');
	});
});

describe('isModeBarShown and isSuspendShown', () => {
	it('draws no mode bar in the lobby or on the ended screen', () => {
		expect(isModeBarShown('lobby')).toBe(false);
		expect(isModeBarShown('ended')).toBe(false);
		expect(isModeBarShown('opening')).toBe(true);
		expect(isModeBarShown('debate')).toBe(true);
		expect(isModeBarShown('suspended')).toBe(true);
	});

	it('draws Suspend during the opening and debate, not while suspended', () => {
		expect(isSuspendShown('opening')).toBe(true);
		expect(isSuspendShown('debate')).toBe(true);
		expect(isSuspendShown('suspended')).toBe(false);
		expect(isSuspendShown('lobby')).toBe(false);
		expect(isSuspendShown('ended')).toBe(false);
	});
});

describe('modeBarTabs', () => {
	it('puts the dot on GSL in formal debate and links it to chair', () => {
		const tabs = modeBarTabs({ page: 'motions', mode: 'formal_debate', motionsOnFloorCount: 0 });
		const gsl = tabs[0];
		const motions = tabs[1];

		expect(gsl).toMatchObject({ view: 'gsl', isLive: true, isSelected: false, route: 'chair' });
		expect(motions).toMatchObject({ isLive: false, isSelected: true, route: 'motions' });
	});

	it('selects the live tab on chair', () => {
		const tabs = modeBarTabs({ page: 'chair', mode: 'unmoderated_caucus', motionsOnFloorCount: 0 });
		const selected = tabs.filter((tab) => tab.isSelected).map((tab) => tab.view);
		const live = tabs.filter((tab) => tab.isLive).map((tab) => tab.view);

		expect(selected).toEqual(['unmod']);
		expect(live).toEqual(['unmod']);
	});

	it('puts no dot on any tab while suspended', () => {
		const tabs = modeBarTabs({ page: 'chair', mode: 'suspended', motionsOnFloorCount: 0 });

		expect(tabs.some((tab) => tab.isLive)).toBe(false);
		expect(tabs.some((tab) => tab.isSelected)).toBe(false);
		expect(tabs.every((tab) => tab.route === tab.view)).toBe(true);
	});

	it('counts the motions on the floor on the Motions tab only, and only when there are some', () => {
		const withMotions = modeBarTabs({ page: 'gsl', mode: 'formal_debate', motionsOnFloorCount: 2 });
		const withoutMotions = modeBarTabs({
			page: 'gsl',
			mode: 'formal_debate',
			motionsOnFloorCount: 0
		});

		expect(withMotions.map((tab) => tab.count)).toEqual([null, 2, null, null, null, null]);
		expect(withoutMotions.every((tab) => tab.count === null)).toBe(true);
	});

	it('shows only the views that are built, in order', () => {
		const tabs = modeBarTabs({
			page: 'gsl',
			mode: 'formal_debate',
			motionsOnFloorCount: 0,
			builtViews: ['voting', 'gsl', 'motions']
		});

		expect(tabs.map((tab) => tab.label)).toEqual(['GSL', 'Motions', 'Vote']);
	});
});

describe('isLiveStripShown', () => {
	const gslWithSpeaker: LiveStripFacts = {
		page: 'motions',
		mode: 'formal_debate',
		hasSpeaker: true,
		hasPresentSeatWaiting: false
	};

	it('shows on another view while the GSL has a speaker', () => {
		expect(isLiveStripShown(gslWithSpeaker)).toBe(true);
	});

	it('shows on another view while a present seat waits, with nobody on the floor', () => {
		const facts = { ...gslWithSpeaker, hasSpeaker: false, hasPresentSeatWaiting: true };

		expect(isLiveStripShown(facts)).toBe(true);
	});

	it('does not show while the live list has nobody speaking and nobody waiting', () => {
		const facts = { ...gslWithSpeaker, hasSpeaker: false, hasPresentSeatWaiting: false };

		expect(isLiveStripShown(facts)).toBe(false);
	});

	it('shows for a Mod or a single speaker on the same terms', () => {
		expect(isLiveStripShown({ ...gslWithSpeaker, mode: 'moderated_caucus' })).toBe(true);
		expect(isLiveStripShown({ ...gslWithSpeaker, mode: 'single_speaker' })).toBe(true);
	});

	it('always shows for an Unmod, which has a clock and no list', () => {
		const facts = {
			...gslWithSpeaker,
			mode: 'unmoderated_caucus',
			hasSpeaker: false,
			hasPresentSeatWaiting: false
		} as const;

		expect(isLiveStripShown(facts)).toBe(true);
	});

	it('never shows on chair, nor on the live view itself', () => {
		expect(isLiveStripShown({ ...gslWithSpeaker, page: 'chair' })).toBe(false);
		expect(isLiveStripShown({ ...gslWithSpeaker, page: 'gsl' })).toBe(false);
	});

	it('shows on the roll call and the pages inside the frame', () => {
		expect(isLiveStripShown({ ...gslWithSpeaker, page: 'roll-call' })).toBe(true);
		expect(isLiveStripShown({ ...gslWithSpeaker, page: 'notes' })).toBe(true);
	});

	it('never shows for a vote, while suspended or with no session', () => {
		expect(isLiveStripShown({ ...gslWithSpeaker, mode: 'voting' })).toBe(false);
		expect(isLiveStripShown({ ...gslWithSpeaker, mode: 'suspended' })).toBe(false);
		expect(isLiveStripShown({ ...gslWithSpeaker, mode: 'idle' })).toBe(false);
	});
});

describe('motionPassLanding', () => {
	it('lands on chair for a motion that changes what the room is doing', () => {
		expect(motionPassLanding('moderated_caucus')).toBe('chair');
		expect(motionPassLanding('unmoderated_caucus')).toBe('chair');
		expect(motionPassLanding('suspend_meeting')).toBe('chair');
		expect(motionPassLanding('adjourn_meeting')).toBe('chair');
		expect(motionPassLanding('close_debate')).toBe('chair');
	});

	it('stays on Motions for an extension, a document or any other motion', () => {
		expect(motionPassLanding('extend_caucus')).toBe('motions');
		expect(motionPassLanding('introduce_document')).toBe('motions');
		expect(motionPassLanding('other')).toBe('motions');
	});
});

describe('readFromView', () => {
	it('reads every chair page the field may name', () => {
		expect(readFromView('gsl')).toBe('gsl');
		expect(readFromView('voting')).toBe('voting');
		expect(readFromView('roll-call')).toBe('roll-call');
		expect(readFromView('awards')).toBe('awards');
		expect(readFromView('chair')).toBe('chair');
	});

	it('means chair for anything else, or nothing at all', () => {
		expect(readFromView('https://example.com')).toBe('chair');
		expect(readFromView('GSL')).toBe('chair');
		expect(readFromView('')).toBe('chair');
		expect(readFromView(null)).toBe('chair');
	});
});

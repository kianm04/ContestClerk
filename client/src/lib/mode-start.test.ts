import { describe, expect, it } from 'vitest';
import {
	START_REFUSALS,
	endedModeName,
	isModeRunning,
	isSuspendedIn,
	lineAboveStartButton,
	startBlockedReason,
	startEndsSentence
} from './mode-start';

describe('isModeRunning and isSuspendedIn', () => {
	it('runs the mode the room is in', () => {
		const state = { mode: 'moderated_caucus' as const, modeBeforeSuspension: null };

		expect(isModeRunning(state, 'moderated_caucus')).toBe(true);
		expect(isModeRunning(state, 'unmoderated_caucus')).toBe(false);
		expect(isSuspendedIn(state, 'moderated_caucus')).toBe(false);
	});

	it('still runs a mode the room is suspended in, which comes back with the session', () => {
		const state = { mode: 'suspended' as const, modeBeforeSuspension: 'single_speaker' as const };

		expect(isModeRunning(state, 'single_speaker')).toBe(true);
		expect(isSuspendedIn(state, 'single_speaker')).toBe(true);
		expect(isModeRunning(state, 'moderated_caucus')).toBe(false);
	});

	it('reads a room written before the suspension was remembered as not suspended in any mode', () => {
		expect(isModeRunning({ mode: 'suspended' }, 'unmoderated_caucus')).toBe(false);
	});
});

describe('endedModeName and startEndsSentence', () => {
	it('names the live mode a start would end', () => {
		expect(endedModeName('unmoderated_caucus', 'moderated_caucus')).toBe('the unmoderated caucus');
		expect(endedModeName('single_speaker', 'moderated_caucus')).toBe('the single speaker');
		expect(endedModeName('moderated_caucus', 'single_speaker')).toBe('the moderated caucus');
		expect(endedModeName('voting', 'unmoderated_caucus')).toBe('the vote');
	});

	it('names nothing for formal debate, no session, a suspension or the mode itself', () => {
		expect(endedModeName('formal_debate', 'moderated_caucus')).toBeNull();
		expect(endedModeName('idle', 'moderated_caucus')).toBeNull();
		expect(endedModeName('suspended', 'moderated_caucus')).toBeNull();
		expect(endedModeName('moderated_caucus', 'moderated_caucus')).toBeNull();
	});

	it('writes the line above the button', () => {
		expect(startEndsSentence('the unmoderated caucus')).toBe(
			'Starting this ends the unmoderated caucus.'
		);
	});
});

describe('startBlockedReason', () => {
	it('lets a start go ahead in a running, unsuspended room with no vote open', () => {
		expect(startBlockedReason({ isSuspended: false, hasOpenVote: false })).toBeNull();
	});

	it('waits for an open vote to close', () => {
		expect(startBlockedReason({ isSuspended: false, hasOpenVote: true })).toBe(
			'Close the open vote first.'
		);
	});

	it('asks for the session to resume first, before anything else', () => {
		expect(startBlockedReason({ isSuspended: true, hasOpenVote: true })).toBe(
			START_REFUSALS.suspended
		);
		expect(START_REFUSALS.suspended).toBe('Resume the session first.');
	});
});

describe('lineAboveStartButton', () => {
	it('says why the button is disabled first, then what starting ends, else nothing', () => {
		expect(lineAboveStartButton('Close the open vote first.', 'the vote')).toBe(
			'Close the open vote first.'
		);
		expect(lineAboveStartButton(null, 'the single speaker')).toBe(
			'Starting this ends the single speaker.'
		);
		expect(lineAboveStartButton(null, null)).toBeNull();
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	LEAVING_GRACE_MS,
	isLeavingPage,
	waitForPageToGo,
	watchForPageLeaving
} from './page-leaving';

// A plain `EventTarget` stands in for `window`: it has the same
// `addEventListener`, and a test fires the browser's events on it by hand.
const browserWindow = new EventTarget() as unknown as Window;
watchForPageLeaving(browserWindow);

beforeEach(() => {
	vi.useFakeTimers();
	// Every test starts on a page the browser is not leaving.
	browserWindow.dispatchEvent(new Event('pageshow'));
});

afterEach(() => {
	vi.useRealTimers();
});

describe('isLeavingPage', () => {
	it('is false while the reader stays on the page', () => {
		expect(isLeavingPage()).toBe(false);
	});

	it('is true once the browser starts to leave the page', () => {
		browserWindow.dispatchEvent(new Event('beforeunload'));

		expect(isLeavingPage()).toBe(true);
	});

	it('is false again when the back button brings the page back', () => {
		browserWindow.dispatchEvent(new Event('beforeunload'));
		browserWindow.dispatchEvent(new Event('pageshow'));

		expect(isLeavingPage()).toBe(false);
	});

	it('is false again once a page that stayed (a download, say) has waited the grace', () => {
		browserWindow.dispatchEvent(new Event('beforeunload'));
		vi.advanceTimersByTime(LEAVING_GRACE_MS);

		expect(isLeavingPage()).toBe(false);
	});
});

describe('waitForPageToGo', () => {
	it('finishes only after the grace, if the page is still here', async () => {
		let hasFinished = false;
		const waiting = waitForPageToGo().then(() => {
			hasFinished = true;
		});

		await vi.advanceTimersByTimeAsync(LEAVING_GRACE_MS - 1);
		expect(hasFinished).toBe(false);

		await vi.advanceTimersByTimeAsync(1);
		await waiting;
		expect(hasFinished).toBe(true);
	});
});

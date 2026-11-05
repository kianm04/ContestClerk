import { describe, expect, it } from 'vitest';
import {
	DELEGATE_SLIDES,
	FADE_MS,
	LAST_REST_MS,
	REST_MS,
	REWIND_MS,
	SLOT_STYLES,
	TURN_MS,
	nextCarouselStep,
	slideSlot
} from './delegate-slides';

describe('DELEGATE_SLIDES', () => {
	it('tells the five stages of the journey in order', () => {
		expect(DELEGATE_SLIDES.map((slide) => slide.stage)).toEqual([
			'Discover',
			'Apply',
			'Accepted',
			'Prepare',
			'Participate'
		]);
	});
});

describe('slideSlot', () => {
	it('puts nothing on the left of the first stage, and the second on its right', () => {
		const slots = DELEGATE_SLIDES.map((_, index) => slideSlot(index, 0));

		expect(slots).toEqual(['center', 'right', 'far-right', 'far-right', 'far-right']);
	});

	it('shows the stage before on the left and the stage after on the right', () => {
		const slots = DELEGATE_SLIDES.map((_, index) => slideSlot(index, 2));

		expect(slots).toEqual(['far-left', 'left', 'center', 'right', 'far-right']);
	});

	it('puts nothing on the right of the last stage', () => {
		const slots = DELEGATE_SLIDES.map((_, index) => slideSlot(index, 4));

		expect(slots).toEqual(['far-left', 'far-left', 'far-left', 'left', 'center']);
	});
});

describe('SLOT_STYLES', () => {
	it('keeps the centre slide straight, whole and in front', () => {
		const center = SLOT_STYLES.center;

		expect(center.transform).toContain('rotateY(0deg)');
		expect(center.transform).toContain('scale(1)');
		expect(center.opacity).toBe(1);
		expect(Math.max(...Object.values(SLOT_STYLES).map((style) => style.zIndex))).toBe(
			center.zIndex
		);
	});

	it('hides the slides more than one stage away', () => {
		expect(SLOT_STYLES['far-left'].opacity).toBe(0);
		expect(SLOT_STYLES['far-right'].opacity).toBe(0);
	});
});

describe('nextCarouselStep', () => {
	it('turns on one stage after the turn and a rest', () => {
		expect(nextCarouselStep({ activeIndex: 1, phase: 'showing' }, 5)).toEqual({
			delayMs: TURN_MS + REST_MS,
			next: { activeIndex: 2, phase: 'showing' }
		});
	});

	it('rests longer on the last stage, then fades out rather than turning to the first', () => {
		expect(nextCarouselStep({ activeIndex: 4, phase: 'showing' }, 5)).toEqual({
			delayMs: TURN_MS + LAST_REST_MS,
			next: { activeIndex: 4, phase: 'fading' }
		});
	});

	it('rewinds to the first stage once faded out, then shows it again', () => {
		expect(nextCarouselStep({ activeIndex: 4, phase: 'fading' }, 5)).toEqual({
			delayMs: FADE_MS,
			next: { activeIndex: 0, phase: 'rewinding' }
		});
		expect(nextCarouselStep({ activeIndex: 0, phase: 'rewinding' }, 5)).toEqual({
			delayMs: REWIND_MS,
			next: { activeIndex: 0, phase: 'showing' }
		});
	});
});

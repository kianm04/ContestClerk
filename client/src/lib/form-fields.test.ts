import { describe, expect, it } from 'vitest';
import {
	CONTROL_CLASSES,
	DENSE_CONTROL_CLASSES,
	DENSE_LABEL_CLASSES,
	LABEL_CLASSES,
	controlClasses,
	fieldDescribedBy,
	fieldErrorId,
	fieldHelpId,
	fieldId,
	labelClasses
} from './form-fields';

describe('fieldId', () => {
	it('puts the name after a prefix', () => {
		expect(fieldId('city')).toBe('field-city');
	});
});

describe('fieldErrorId', () => {
	it('hangs off the field id', () => {
		expect(fieldErrorId('city')).toBe('field-city-error');
	});
});

describe('fieldHelpId', () => {
	it('hangs off the field id', () => {
		expect(fieldHelpId('city')).toBe('field-city-help');
	});
});

describe('fieldDescribedBy', () => {
	it('names nothing when the field has neither a help line nor an error', () => {
		expect(fieldDescribedBy('city', { hasHelp: false, hasError: false })).toBeUndefined();
	});

	it('names the help line on its own', () => {
		expect(fieldDescribedBy('city', { hasHelp: true, hasError: false })).toBe('field-city-help');
	});

	it('names the error on its own', () => {
		expect(fieldDescribedBy('city', { hasHelp: false, hasError: true })).toBe('field-city-error');
	});

	it('names both, help first, separated by a space', () => {
		expect(fieldDescribedBy('city', { hasHelp: true, hasError: true })).toBe(
			'field-city-help field-city-error'
		);
	});
});

describe('controlClasses', () => {
	it('gives the management pages the compact box', () => {
		expect(controlClasses(true)).toBe(DENSE_CONTROL_CLASSES);
		expect(controlClasses(false)).toBe(CONTROL_CLASSES);
	});

	it('keeps the 44px touch target on a phone', () => {
		expect(DENSE_CONTROL_CLASSES).toContain('min-h-11');
		expect(DENSE_CONTROL_CLASSES).toContain('lg:min-h-10');
	});
});

describe('labelClasses', () => {
	it('drops the small capitals on the management pages', () => {
		expect(labelClasses(true)).toBe(DENSE_LABEL_CLASSES);
		expect(labelClasses(false)).toBe(LABEL_CLASSES);
		expect(DENSE_LABEL_CLASSES).not.toContain('uppercase');
	});
});

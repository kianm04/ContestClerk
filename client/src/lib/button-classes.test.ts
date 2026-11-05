import { describe, expect, it } from 'vitest';
import {
	buttonClasses,
	buttonIconSize,
	menuItemClasses,
	quickFilterChipClasses
} from './button-classes';

describe('buttonClasses', () => {
	it('joins the shared, variant and size classes', () => {
		const classes = buttonClasses('primary', 'md', false);

		expect(classes).toContain('inline-flex');
		expect(classes).toContain('bg-primary');
		expect(classes).toContain('hover:bg-primary/90');
		expect(classes).toContain('px-4');
		expect(classes).not.toContain('w-full');
	});

	it('keeps the small button 44px tall and stretches it when asked', () => {
		const classes = buttonClasses('secondary', 'sm', true);

		expect(classes).toContain('min-h-11');
		expect(classes).toContain('px-3');
		expect(classes).toContain('border-border');
		expect(classes).toContain('w-full');
	});
});

describe('buttonClasses for a button with a key', () => {
	it('names the button as the group whose hover and focus show the key', () => {
		expect(buttonClasses('secondary', 'md', false, true)).toContain('group/key relative');
	});

	it('leaves the group out for a button without a key', () => {
		expect(buttonClasses('secondary', 'md', false)).not.toContain('group/key');
	});
});

describe('buttonClasses for the speech controls', () => {
	it('draws the quiet red button and the large size', () => {
		const classes = buttonClasses('soft-danger', 'lg', false);

		expect(classes).toContain('bg-destructive-muted');
		expect(classes).toContain('text-destructive');
		expect(classes).toContain('min-h-14');
	});
});

describe('buttonClasses for a row delete icon', () => {
	it('stays grey with no border until the pointer is on it, then turns red', () => {
		const classes = buttonClasses('quiet-danger', 'dense-sm', false);

		expect(classes).toContain('text-muted-foreground');
		expect(classes).toContain('hover:text-destructive');
		expect(classes).toContain('hover:bg-destructive-muted');
		expect(classes).not.toContain('border');
		expect(classes).not.toContain(' bg-danger');
	});
});

describe('menuItemClasses', () => {
	it('colours a destructive line red', () => {
		expect(menuItemClasses('danger')).toContain('text-destructive');
	});

	it('draws any other line in ink', () => {
		expect(menuItemClasses(undefined)).toContain('text-foreground');
		expect(menuItemClasses('default')).not.toContain('danger');
	});
});

describe('buttonIconSize', () => {
	it('draws a smaller icon on the dense management buttons', () => {
		expect(buttonIconSize('dense')).toBe(16);
		expect(buttonIconSize('dense-sm')).toBe(16);
		expect(buttonIconSize('md')).toBe(20);
	});
});

describe('quickFilterChipClasses', () => {
	it('fills the chip light blue only while the results are filtered its way', () => {
		expect(quickFilterChipClasses(true)).toContain('bg-brand-100');
		expect(quickFilterChipClasses(false)).not.toContain('bg-brand-100');
	});

	it('draws every chip as a pill a finger can press', () => {
		expect(quickFilterChipClasses(true)).toContain('rounded-full');
		expect(quickFilterChipClasses(false)).toContain('h-11');
	});
});

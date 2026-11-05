import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Trash2 from '@lucide/svelte/icons/trash-2';
import { BUSY_INDICATOR_DELAY_MS } from '$lib/button-classes';
import Button from './Button.svelte';

describe('Button', () => {
	it('is a submit button by default', () => {
		render(Button, { props: { label: 'Submit application', variant: 'primary' } });

		const button = screen.getByRole('button', { name: 'Submit application' });
		expect(button.getAttribute('type')).toBe('submit');
	});

	it('becomes a link when given an href', () => {
		render(Button, {
			props: { label: 'Browse conferences', variant: 'primary', href: '/conferences' }
		});

		expect(screen.getByRole('link', { name: 'Browse conferences' }).getAttribute('href')).toBe(
			'/conferences'
		);
	});

	it('stretches across what holds it when it is asked to', () => {
		render(Button, { props: { label: 'Log in', variant: 'primary', isFullWidth: true } });

		expect(screen.getByRole('button').className).toContain('w-full');
	});

	it('is only as wide as its words by default', () => {
		render(Button, { props: { label: 'Log in', variant: 'primary' } });

		expect(screen.getByRole('button').className).not.toContain('w-full');
	});

	it('uses the colours of the variant it is given', () => {
		render(Button, { props: { label: 'Delete committee', variant: 'danger' } });

		expect(screen.getByRole('button').className).toContain('bg-destructive');
	});

	it('cannot be pressed while it is disabled', () => {
		render(Button, { props: { label: 'Save changes', variant: 'primary', isDisabled: true } });

		expect(screen.getByRole('button')).toHaveProperty('disabled', true);
	});

	it('cannot be pressed while it is waiting for the server', () => {
		// A press on the loading button must not send its form a second time.
		const form = document.createElement('form');
		let sentCount = 0;
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			sentCount += 1;
		});
		document.body.append(form);
		render(Button, {
			target: form,
			props: { label: 'Save changes', variant: 'primary', isLoading: true }
		});

		const button = screen.getByRole('button');
		button.click();

		expect(sentCount).toBe(0);
		expect(button.getAttribute('aria-busy')).toBe('true');
		expect(button.getAttribute('aria-disabled')).toBe('true');
		form.remove();
	});

	it('keeps the keyboard focus while it is waiting for the server', async () => {
		// A disabled button loses the focus, so a loading one is not disabled.
		const view = render(Button, { props: { label: 'Save changes', variant: 'primary' } });
		const button = screen.getByRole('button');
		button.focus();

		await view.rerender({ label: 'Save changes', variant: 'primary', isLoading: true });

		expect(button).toHaveProperty('disabled', false);
		expect(document.activeElement).toBe(button);
	});

	it('shows its spinner only once the server has taken longer than the delay', async () => {
		// A quick answer must never flash a spinner on and off again (T140).
		vi.useFakeTimers();
		try {
			const view = render(Button, { props: { label: 'Save changes', variant: 'primary' } });
			await view.rerender({ label: 'Save changes', variant: 'primary', isLoading: true });

			expect(document.querySelector('.animate-spin')).toBeNull();
			expect(screen.getByRole('button').getAttribute('aria-busy')).toBe('true');

			await vi.advanceTimersByTimeAsync(BUSY_INDICATOR_DELAY_MS - 50);
			expect(document.querySelector('.animate-spin')).toBeNull();

			await vi.advanceTimersByTimeAsync(50);
			expect(document.querySelector('.animate-spin')).not.toBeNull();

			await view.rerender({ label: 'Save changes', variant: 'primary', isLoading: false });
			expect(document.querySelector('.animate-spin')).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('never shows a spinner when the answer comes back before the delay', async () => {
		vi.useFakeTimers();
		try {
			const view = render(Button, { props: { label: 'Save changes', variant: 'primary' } });
			await view.rerender({ label: 'Save changes', variant: 'primary', isLoading: true });
			await vi.advanceTimersByTimeAsync(BUSY_INDICATOR_DELAY_MS / 2);
			await view.rerender({ label: 'Save changes', variant: 'primary', isLoading: false });
			await vi.advanceTimersByTimeAsync(BUSY_INDICATOR_DELAY_MS);

			expect(document.querySelector('.animate-spin')).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("runs the page's own onclick when it is a link, too", async () => {
		// "Add speaker" in the speaking queue is a link that, with JavaScript,
		// puts the cursor in the search box instead of being followed.
		const onclick = vi.fn((event: MouseEvent) => event.preventDefault());
		render(Button, {
			props: { label: 'Add speaker', variant: 'primary', href: '/conferences', onclick }
		});

		await fireEvent.click(screen.getByRole('link', { name: 'Add speaker' }));

		expect(onclick).toHaveBeenCalledOnce();
	});

	it('drops the address of a disabled link so the browser will not follow it', () => {
		render(Button, {
			props: {
				label: 'Browse conferences',
				variant: 'primary',
				href: '/conferences',
				isDisabled: true
			}
		});

		const link = screen.getByText('Browse conferences');

		expect(link.getAttribute('href')).toBeNull();
		expect(link.getAttribute('aria-disabled')).toBe('true');
	});

	it('sends one button to another form action when given a formaction', () => {
		render(Button, { props: { label: 'Back', variant: 'secondary', formaction: '?/back' } });

		expect(screen.getByRole('button').getAttribute('formaction')).toBe('?/back');
	});

	it('keeps the words for a screen reader when it is drawn as an icon alone', () => {
		// The words are the button's only name, so taking them off the screen must
		// not take them out of the page. The seat rows on the committee editor
		// repeat the same four buttons down a long list, which is what this is for.
		render(Button, {
			props: { label: 'Delete France', variant: 'danger', icon: Trash2, isLabelHidden: true }
		});

		const button = screen.getByRole('button', { name: 'Delete France' });

		// The words are the button's name and nothing else: they are not laid out,
		// so a row of these cannot change the shape of the page around them.
		expect(button.getAttribute('aria-label')).toBe('Delete France');
		expect(button.textContent?.trim()).toBe('');
	});

	it("skips the browser's required-field check when it is asked to", () => {
		// A form has one set of required fields and often several submit buttons.
		// "Add topic" on the committee form must not be refused because the name
		// above it has not been typed yet.
		render(Button, {
			props: { label: 'Add topic', variant: 'secondary', skipsValidation: true }
		});

		expect(screen.getByRole('button').hasAttribute('formnovalidate')).toBe(true);
	});

	it('leaves the required-field check alone by default', () => {
		render(Button, { props: { label: 'Save changes', variant: 'primary' } });

		expect(screen.getByRole('button').hasAttribute('formnovalidate')).toBe(false);
	});

	it('sends its own name and value with the form, so one form can hold several answers', () => {
		render(Button, {
			props: { label: 'Present', variant: 'secondary', name: 'status', value: 'present' }
		});

		const button = screen.getByRole('button', { name: 'Present' });
		expect(button.getAttribute('name')).toBe('status');
		expect(button.getAttribute('value')).toBe('present');
	});

	it('tells a screen reader which button of a set is the chosen one', () => {
		render(Button, { props: { label: 'Absent', variant: 'primary', isPressed: true } });

		expect(screen.getByRole('button', { name: 'Absent', pressed: true })).toBeTruthy();
	});

	it('says nothing about being pressed unless it is one of a set', () => {
		render(Button, { props: { label: 'Save changes', variant: 'primary' } });

		expect(screen.getByRole('button').hasAttribute('aria-pressed')).toBe(false);
	});

	it('takes the focus when the page loads, only when asked to', () => {
		render(Button, { props: { label: 'Present', variant: 'primary', hasAutofocus: true } });

		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Present' }));
	});

	it('stays 44px tall at the small size, because it is still tappable', () => {
		render(Button, { props: { label: 'Edit', variant: 'ghost', size: 'sm' } });

		expect(screen.getByRole('button').className).toContain('min-h-11');
	});

	it('declares its key and shows it as a hint that is not part of its name', () => {
		render(Button, { props: { label: '+15 s', variant: 'secondary', keyShortcut: 'Plus' } });

		const button = screen.getByRole('button', { name: '+15 s' });
		const hint = button.querySelector('kbd');
		expect(button.getAttribute('aria-keyshortcuts')).toBe('Plus');
		expect(hint?.textContent?.trim()).toBe('+');
		expect(hint?.getAttribute('aria-hidden')).toBe('true');
		// The hint shows only while this button is hovered or focused, never for a row around it.
		expect(button.className).toContain('group/key');
		expect(hint?.className).toContain('group-hover/key:inline-block');
	});

	it('declares its key on a link, too', () => {
		render(Button, {
			props: { label: 'Roll call', variant: 'ghost', href: '/conferences', keyShortcut: 'R' }
		});

		const link = screen.getByRole('link', { name: 'Roll call' });
		expect(link.getAttribute('aria-keyshortcuts')).toBe('R');
		expect(link.querySelector('kbd')?.textContent?.trim()).toBe('R');
	});

	it('declares no key and draws no hint unless it is given one', () => {
		render(Button, { props: { label: 'Save changes', variant: 'primary' } });

		expect(screen.getByRole('button').hasAttribute('aria-keyshortcuts')).toBe(false);
		expect(screen.getByRole('button').querySelector('kbd')).toBeNull();
	});
});

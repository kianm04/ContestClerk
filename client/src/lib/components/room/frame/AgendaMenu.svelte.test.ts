import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createInstantForm } from '$lib/instant-form.svelte';
import type { ChairExpectation } from '$lib/chair-form';
import AgendaMenu from './AgendaMenu.svelte';

const ACTION = '/conferences/thimun-2027/committees/unsc/chair?fromView=motions&/setAgenda';
const TOPICS = ['Humanitarian access in armed conflict', 'Maritime security in the Gulf of Guinea'];

/** A quick session's `addTopic`, posted from the Motions view. */
const ADD_TOPIC_ACTION =
	'/conferences/thimun-2027/committees/unsc/chair?fromView=motions&/addTopic';

/** The menu with the given agenda, drawn open or shut, with "Add a topic" when given its action. */
function renderMenu(
	agendaTopic: string | null,
	isOpen = false,
	topics = TOPICS,
	addTopicAction: string | null = null
) {
	const form = createInstantForm<ChairExpectation>({ describeFailure: () => 'Not set.' });

	return render(AgendaMenu, {
		props: {
			topics,
			agendaTopic,
			setAgendaAction: ACTION,
			addTopicAction,
			isOpen,
			submitExpecting: form.submitExpecting
		}
	});
}

describe('AgendaMenu', () => {
	it('names the topic under debate on its trigger, with all of it in `title`', () => {
		const { container } = renderMenu(TOPICS[0]);
		const trigger = container.querySelector('summary');

		expect(trigger?.textContent).toContain(TOPICS[0]);
		expect(trigger?.getAttribute('title')).toBe(TOPICS[0]);
		expect(trigger?.className).toContain('text-ink-900');
	});

	it('reads "Set agenda" in plain ink, never as a warning, while none is set', () => {
		const { container } = renderMenu(null);
		const trigger = container.querySelector('summary');

		expect(trigger?.textContent).toContain('Set agenda');
		expect(trigger?.className).toContain('text-ink-600');
		expect(trigger?.className).not.toContain('warning');
	});

	it("lists the committee's topics, the current one ticked, each one press that posts setAgenda", () => {
		renderMenu(TOPICS[0], true);

		const current = screen.getByRole('button', { name: TOPICS[0] });
		const other = screen.getByRole('button', { name: TOPICS[1] });
		expect(current.getAttribute('aria-pressed')).toBe('true');
		expect(other.getAttribute('aria-pressed')).toBe('false');
		expect(other.getAttribute('name')).toBe('topic');
		expect(other.getAttribute('value')).toBe(TOPICS[1]);
		expect(other.closest('form')?.getAttribute('action')).toBe(ACTION);
		expect(other.closest('form')?.getAttribute('method')).toBe('post');
	});

	it('is drawn open when the address asks for it, and shut otherwise', () => {
		const { container, unmount } = renderMenu(null, true);
		expect(container.querySelector('details')?.open).toBe(true);
		unmount();

		const shut = renderMenu(null, false);
		expect(shut.container.querySelector('details')?.open).toBe(false);
	});

	it('has no menu for a committee without topics', () => {
		const { container } = renderMenu(null, false, []);

		expect(container.querySelector('details')).toBeNull();
		expect(container.textContent?.trim()).toBe('');
	});

	it('offers no "Add a topic" outside a quick session', () => {
		renderMenu(TOPICS[0], true);

		expect(screen.queryByPlaceholderText('Add a topic')).toBeNull();
	});

	it('offers "Add a topic" in a quick session, posting addTopic, even with no topics yet', () => {
		const { container } = renderMenu(null, true, [], ADD_TOPIC_ACTION);

		const field = screen.getByPlaceholderText('Add a topic');
		expect(container.querySelector('summary')?.textContent).toContain('Set agenda');
		expect(field.getAttribute('name')).toBe('topic');
		expect(field.hasAttribute('required')).toBe(true);
		expect(field.closest('form')?.getAttribute('action')).toBe(ADD_TOPIC_ACTION);
		expect(screen.getByRole('button', { name: 'Add topic' }).closest('form')).toBe(
			field.closest('form')
		);
	});
});

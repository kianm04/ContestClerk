<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import type { ChairForm, ChairSubmitInput } from '$lib/chair-form';
	import { setAgendaPress } from '$lib/room-presses';
	import AgendaAddTopic from './AgendaAddTopic.svelte';

	type Props = {
		/** The committee's topics, in the organiser's order. */
		topics: string[];
		/** The topic under debate, or null while the agenda is not set. */
		agendaTopic: string | null;
		/** The live room's `setAgenda`, naming the page the chair is on (`chairFrameAction`). */
		setAgendaAction: string;
		/** A quick session's `addTopic`, for "Add a topic" under the topics; null elsewhere. */
		addTopicAction?: string | null;
		/** Drawn open, as `?agenda=change` asks without JavaScript. */
		isOpen: boolean;
		/** The chair's instant form (`$lib/chair-form.ts`), which shows a press at once. */
		submitExpecting: ChairForm['submitExpecting'];
	};

	let {
		topics,
		agendaTopic,
		setAgendaAction,
		addTopicAction = null,
		isOpen,
		submitExpecting
	}: Props = $props();

	/** The trigger's id, where the focus goes back to once a topic is pressed. */
	const TRIGGER_ID = 'agenda-menu-trigger';

	// Whether the menu is open. It starts as the address says; a `$derived` can
	// be assigned to, so the chair's own clicks then open and close it.
	// `isOpenInAddress` passes a change on only when the address's answer
	// changes, so a realtime reload does not shut the menu under the chair.
	const isOpenInAddress = $derived(isOpen);
	let isMenuOpen = $derived(isOpenInAddress);

	/** The browser opened or closed the `<details>` itself, from its summary. */
	function handleToggle(event: Event & { currentTarget: HTMLDetailsElement }) {
		isMenuOpen = event.currentTarget.open;
	}

	/** Escape closes the menu, as a person expects of any menu. */
	function handleDocumentKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') isMenuOpen = false;
	}

	/** A click anywhere outside the menu closes it. */
	function handleDocumentClick(event: MouseEvent) {
		const isInside = event.target instanceof Element && event.target.closest('[data-agenda-menu]');

		if (!isInside) isMenuOpen = false;
	}

	/**
	 * One press sets the topic, closes the menu and puts the focus back on its
	 * trigger. "Add a topic" does the same with the topic typed, which the
	 * server adds to the committee's and sets as the agenda.
	 */
	function handleTopicPress(input: ChairSubmitInput) {
		isMenuOpen = false;
		document.getElementById(TRIGGER_ID)?.focus();

		return setAgendaPress(String(input.formData.get('topic') ?? '').trim());
	}
</script>

<!--
	`<svelte:document>` listens on the whole page, for the click outside the
	menu and for Escape. Without JavaScript nothing here runs, and the menu
	still opens and closes from its trigger.
-->
<svelte:document onclick={handleDocumentClick} onkeydown={handleDocumentKeydown} />

<!--
	The topic under debate with a chevron, opening the committee's topics. With
	no agenda it reads "Set agenda" in plain ink, never as a warning (P4). A
	committee without topics has nothing to choose, so it shows no menu,
	except in a quick session, whose menu also has "Add a topic".
	`truncate` cuts a long topic short with "…", and `title` holds all of it.
	On a phone the list is drawn across the screen under the top bar, so a
	long topic wraps rather than running off the edge.
-->
{#if topics.length > 0 || addTopicAction}
	<details data-agenda-menu class="relative min-w-0" open={isMenuOpen} ontoggle={handleToggle}>
		<summary
			id={TRIGGER_ID}
			title={agendaTopic ?? undefined}
			class="-ml-2 flex h-9 max-w-[42vw] cursor-pointer list-none items-center gap-1 rounded-lg px-2 text-body hover:bg-neutral-100 max-[1100px]:max-w-[30vw] max-md:max-w-[40vw] [&::-webkit-details-marker]:hidden {agendaTopic
				? 'text-ink-900'
				: 'text-ink-600'}"
		>
			<span class="truncate">{agendaTopic ?? 'Set agenda'}</span>
			<ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" class="shrink-0" />
		</summary>

		<div
			class="absolute top-full left-0 z-30 mt-1.5 w-max max-w-[min(32rem,calc(100vw-1.5rem))] min-w-56 rounded-xl border border-line bg-surface p-1.5 whitespace-normal shadow-card max-md:fixed max-md:inset-x-3 max-md:top-14 max-md:w-auto max-md:max-w-none"
		>
			<!-- One press on a topic posts `setAgenda` and lands back on the same page. -->
			<form method="post" action={setAgendaAction} use:enhance={submitExpecting(handleTopicPress)}>
				<p id="agenda-menu-heading" class="px-3 pt-2 pb-1 text-small text-ink-600">Agenda</p>
				<div role="group" aria-labelledby="agenda-menu-heading">
					<!-- A topic is a plain string with no id, so its row is keyed by its place in the list. -->
					{#each topics as topic, index (index)}
						<button
							type="submit"
							name="topic"
							value={topic}
							aria-pressed={topic === agendaTopic}
							class="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-neutral-100 aria-pressed:font-semibold"
						>
							<!-- The tick takes its space on every row, so the topics line up. -->
							<Check
								size={18}
								strokeWidth={1.75}
								aria-hidden="true"
								class="w-5 shrink-0 text-brand-700 {topic === agendaTopic ? '' : 'invisible'}"
							/>
							{topic}
						</button>
					{/each}
				</div>
			</form>
			{#if addTopicAction}
				<AgendaAddTopic action={addTopicAction} onSubmit={submitExpecting(handleTopicPress)} />
			{/if}
		</div>
	</details>
{:else if agendaTopic}
	<p class="min-w-0 truncate text-body" title={agendaTopic}>{agendaTopic}</p>
{/if}

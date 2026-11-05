<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import X from '@lucide/svelte/icons/x';
	import { fieldHelpId } from '$lib/form-fields';
	import SetupField from './SetupField.svelte';

	type Props = {
		/** The topics so far; the dialog writes `bind:topics` so a template can fill them. */
		topics: string[];
		/** Edit committee's row of its own: a 44 pixel box, 14 pixel help, labels 3 closer. */
		isWide?: boolean;
	};

	// `$bindable()` lets the dialog write `bind:topics={...}`.
	let { topics = $bindable(), isWide = false }: Props = $props();

	/** What is being typed, not yet a topic. */
	let draft = $state('');

	function addDraft() {
		const topic = draft.trim();
		if (topic !== '' && !topics.includes(topic)) {
			topics = [...topics, topic];
		}
		draft = '';
	}

	/** Enter or a comma turns what was typed into a topic, instead of sending the form. */
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			addDraft();
		}
	}

	function remove(topic: string) {
		topics = topics.filter((kept) => kept !== topic);
	}
</script>

<!--
	The design draws one field holding the chosen topics as chips, with the
	typing space after them and a chevron at the end. Every topic travels as
	its own hidden input named `topics[]`, which the server reads with
	`getAll`. The text field has the same name, so a topic typed but not yet
	added, or typed without JavaScript, is sent as well. `focus-within` gives
	the box the blue border while the typing space inside it has the focus.
-->
<SetupField
	id="topic-draft"
	label="Topics"
	help="Add one or more topics to describe the committee's focus."
	controlClass={isWide ? 'mt-0.75' : undefined}
	helpClass={isWide ? 'fs-14 lh-20' : undefined}
>
	<div
		class={[
			'flex items-center rounded-md border border-creation-input-border bg-white focus-within:border-creation-blue-focus focus-within:outline-1 focus-within:outline-creation-blue-focus max-lg:min-h-11 max-lg:flex-wrap max-lg:py-1',
			isWide ? 'min-h-11 gap-4 pr-3.5 pl-3' : 'min-h-10 gap-3 px-3.5'
		]}
	>
		{#each topics as topic (topic)}
			<span
				class="flex h-7 shrink-0 items-center gap-3 rounded-sm bg-creation-hover px-3 fs-15 lh-20 font-medium text-creation-ink-800"
			>
				{topic}
				<input type="hidden" name="topics[]" value={topic} />
				<button
					type="button"
					class="-mx-1 flex size-5 items-center justify-center max-lg:size-11"
					aria-label="Remove {topic}"
					onclick={() => remove(topic)}
				>
					<X class="size-3.5" aria-hidden="true" />
				</button>
			</span>
		{/each}
		<input
			id="topic-draft"
			name="topics[]"
			placeholder={topics.length === 0 ? 'Select topics...' : ''}
			class="h-9.5 min-w-16 flex-1 border-0 bg-transparent p-0 fs-17 lh-24 text-creation-ink-950 placeholder:text-creation-ink-200 focus:ring-0 focus:outline-none"
			aria-describedby={fieldHelpId('topic-draft')}
			bind:value={draft}
			onkeydown={handleKeydown}
			onblur={addDraft}
		/>
		<ChevronDown class="size-5 shrink-0 text-creation-ink-950" aria-hidden="true" />
	</div>
</SetupField>

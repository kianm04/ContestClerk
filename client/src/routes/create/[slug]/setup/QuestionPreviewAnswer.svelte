<script lang="ts">
	type Props = {
		type: string;
		/** The options of a "Pick one" or "Pick several" question. */
		choices: string[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { type, choices }: Props = $props();

	// The design's answer box. Switched off: the preview is a picture, not a form, and nothing here is sent.
	const BOX_CLASSES =
		'mt-3.5 block w-full rounded-md border border-creation-input-border bg-white px-3 fs-13 placeholder:text-creation-ink-325';
</script>

<!-- What the applicant answers in, for each type of question. -->
{#if type === 'long_text'}
	<textarea
		disabled
		aria-label="Answer"
		placeholder="Type your answer here..."
		class="{BOX_CLASSES} h-27 resize-none py-2.5"></textarea>
{:else if type === 'single_choice' || type === 'multiple_choice'}
	<ul class="mt-3.5 flex flex-col gap-2 fs-13 lh-18">
		{#each choices as choice, index (index)}
			<li class="flex items-center gap-2">
				<input
					disabled
					type={type === 'single_choice' ? 'radio' : 'checkbox'}
					aria-label={choice}
					class="size-4 accent-creation-blue"
				/>
				{choice}
			</li>
		{:else}
			<li class="text-creation-ink-225">No options yet.</li>
		{/each}
	</ul>
{:else if type === 'checkbox'}
	<label class="mt-3.5 flex items-center gap-2 fs-13 lh-18">
		<input disabled type="checkbox" class="size-4 accent-creation-blue" /> Yes
	</label>
{:else}
	<input
		disabled
		aria-label="Answer"
		placeholder="Type your answer here..."
		class="{BOX_CLASSES} h-10"
	/>
{/if}

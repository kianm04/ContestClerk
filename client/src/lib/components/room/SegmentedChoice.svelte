<script lang="ts">
	type Option = {
		/** What the form sends when this one is chosen: `substantive`, `moderated_caucus`, `10`. */
		value: string;
		/** The words on the segment: "Substantive", "Mod", "10 min". */
		label: string;
	};

	type Props = {
		/** The radio buttons' shared name, which the form sends: `kind`, `method`, `length`. */
		name: string;
		options: Option[];
		/** The chosen option's value, or empty for none. */
		value: string;
		/**
		 * The `id` of the visible words that name the group ("Type", "Method"),
		 * which makes the row a `radiogroup` of its own. Left out where the row
		 * sits in a field that already names it as a group (`StartField`).
		 */
		labelledBy?: string;
		/** Narrower segments, for the eight kinds of motion in one row. */
		isCompact?: boolean;
		/** Called with the value the chair chose. Without JavaScript the radio button is simply sent. */
		onChange?: (value: string) => void;
	};

	let { name, options, value, labelledBy, isCompact = false, onChange }: Props = $props();

	// The study's `.seg-option`, and the narrower one of the motion composer's kinds.
	const paddingClass = $derived(isCompact ? 'px-[9px]' : 'px-3');
	const gapClass = $derived(isCompact ? 'gap-1' : 'gap-1.5');
</script>

<!--
	A row of radio buttons drawn as segments (`visual-language.md`), the one
	look of every such choice on the console: a vote's type, majority and
	method, the motion composer's kinds, an Unmod's length, a single speaker's
	purpose and time. The radio itself is hidden (`sr-only` keeps it for a
	screen reader and the keyboard) and the words beside it are the segment.
	`peer-checked:` styles the words of the chosen one, `brand-100` with a
	`brand-500` border. Being real radio buttons, the choice is sent with the
	form without JavaScript, and the arrow keys move between them.
-->
<div
	role={labelledBy ? 'radiogroup' : undefined}
	aria-labelledby={labelledBy}
	class="flex flex-wrap {gapClass}"
>
	<!-- The `(option.value)` key lets Svelte reuse each segment instead of rebuilding it. -->
	{#each options as option (option.value)}
		<label class="relative inline-flex">
			<input
				type="radio"
				{name}
				value={option.value}
				checked={option.value === value}
				onchange={() => onChange?.(option.value)}
				class="peer sr-only"
			/>
			<span
				class="flex h-9 cursor-pointer items-center rounded-lg border border-line bg-surface text-small font-medium whitespace-nowrap text-ink-900 peer-checked:border-brand-500 peer-checked:bg-brand-100 peer-checked:text-brand-900 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500 hover:bg-neutral-100 max-md:h-11 {paddingClass}"
			>
				{option.label}
			</span>
		</label>
	{/each}
</div>

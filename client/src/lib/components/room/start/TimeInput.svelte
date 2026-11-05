<script lang="ts">
	type Props = {
		id: string;
		/** The field's `name`, which the form sends: `totalTime`, `lengthTyped`, `timeTyped`. */
		name: string;
		/** What was typed, kept after a refusal. */
		value: string;
		/** The default it takes when left empty ("10:00"), or "other". */
		placeholder: string;
		/** Its name for a screen reader when no visible label names it ("Other length"). */
		label?: string;
		/** The `id` of the message under the field, when there is one. */
		errorId?: string;
		/** Called as the chair types, so a chosen preset can be let go of. */
		onType?: (text: string) => void;
	};

	let { id, name, value, placeholder, label, errorId, onType }: Props = $props();

	function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
		onType?.(event.currentTarget.value);
	}
</script>

<!--
	A short field for a time, typed the MUN way: "10" is ten minutes, "1:30" a
	minute and a half, "90s" ninety seconds (`readDuration`). 88px wide, the
	digits centred and tabular.
-->
<input
	{id}
	{name}
	{value}
	{placeholder}
	type="text"
	autocomplete="off"
	aria-label={label}
	aria-describedby={errorId}
	oninput={handleInput}
	class="h-11 w-22 rounded-control border border-line bg-surface px-2 text-center tabular-nums placeholder:text-ink-400 focus:border-transparent focus:ring-2 focus:ring-brand-500"
/>

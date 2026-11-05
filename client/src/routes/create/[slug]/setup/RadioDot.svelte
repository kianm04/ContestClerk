<script lang="ts">
	type Props = {
		/** The dot's size and place, such as `size-4.5`. */
		class?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { class: className }: Props = $props();
</script>

<!--
	A picture of a chosen radio button, a blue disc with a 7 pixel white dot,
	as the Edit fee board draws it at the left of the collection dropdown. It
	is not a control: the real choices use `RadioItem`.
-->
<span
	aria-hidden="true"
	class={[
		'pointer-events-none flex size-5 shrink-0 items-center justify-center rounded-full bg-creation-blue',
		className
	]}
>
	<span class="size-1.75 rounded-full bg-white"></span>
</span>

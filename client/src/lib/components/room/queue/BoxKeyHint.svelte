<script lang="ts">
	type Props = {
		/** The key that puts the cursor in the box, such as "/". */
		keyName: string;
	};

	let { keyName }: Props = $props();
</script>

<!--
	The key's hint at the right edge of a box, in the console's `kbd` style.
	The input before it carries Tailwind's `peer` class, so `peer-focus:`
	hides the hint while the box has the cursor; a touch screen has no keys to
	learn, so `[@media(hover:none)]` leaves it out there. A screen reader hears
	the key from the input's `aria-keyshortcuts` instead (`aria-hidden`).
-->
<kbd
	aria-hidden="true"
	class="pointer-events-none absolute right-2.5 min-w-5 rounded border border-line bg-neutral-100 px-1.5 py-0.5 text-center text-small leading-none font-medium text-ink-600 peer-focus:invisible [@media(hover:none)]:hidden"
>
	{keyName}
</kbd>

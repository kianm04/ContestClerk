<script lang="ts">
	import type { ResolvedPathname } from '$app/types';

	type Props = {
		/** Where the link leads, an address `resolve()` built (`$lib/urls.ts`). */
		href: ResolvedPathname;
		/** Its words: "Session record", "Take it seat by seat". */
		label: string;
	};

	let { href, label }: Props = $props();
</script>

<!--
	A plain link in the light blue the console keeps for links, beside a
	screen's one filled button (P1): "Session record", "Edit", "Change". On a
	phone it is 44 px tall, so a finger can hit it, without looking any bigger
	than its words.
-->
<a
	{href}
	class="inline-flex items-center font-medium text-brand-700 hover:underline max-md:min-h-11"
>
	{label}
</a>

<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils';

	type Props = {
		/** Where it sits, such as `absolute top-3.5 right-3.5` over the banner. */
		class?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { class: className }: Props = $props();
</script>

<!--
	The white "Draft" pill with a blue dot the designs lay over the preview's
	banner: 30 pixels tall, no border, a breath of shadow. shadcn's `Badge`
	brings the shape; the classes bring the design's size.
-->
<Badge
	variant="outline"
	class={cn(
		'h-7.5 gap-2 rounded-full border-0 bg-white px-3.5 fs-15 lh-20 font-medium text-creation-ink-650 shadow-creation-pill',
		className
	)}
>
	<span aria-hidden="true" class="size-2 rounded-full bg-creation-blue"></span>
	Draft
</Badge>

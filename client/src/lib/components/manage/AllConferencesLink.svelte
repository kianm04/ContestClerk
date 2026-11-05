<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import { manageUrl } from '$lib/urls';
</script>

<!-- Back to the list of every conference the organiser runs, at the top of the sidebar. -->
<a
	href={manageUrl()}
	class="inline-flex min-h-11 items-center gap-1.5 px-2.5 text-small text-muted-foreground lg:min-h-0"
>
	<ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
	All conferences
</a>

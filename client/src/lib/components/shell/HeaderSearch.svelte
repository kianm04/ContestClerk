<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { conferenceListUrl } from '$lib/urls';
</script>

<!--
	The top bar's conference search. A real GET form, so searching works with no
	JavaScript: pressing Enter opens `/conferences?q=…`.

	The box takes whatever room the links leave, up to `max-w-sm`, so the whole
	placeholder shows on a wide screen (T150). It never gets narrower than
	`min-w-44`, and `flex-1` lets it give way to the links rather than push the
	account menu off a 1280px screen. It appears from `xl` (1280px): below that
	the links and the box together are wider than the bar.
-->
<form method="get" action={conferenceListUrl()} class="hidden max-w-sm min-w-44 flex-1 xl:block">
	<label for="header-conference-search" class="sr-only">Search conferences</label>
	<Input
		id="header-conference-search"
		type="search"
		name="q"
		placeholder="Search conferences"
		class="h-9"
	/>
</form>

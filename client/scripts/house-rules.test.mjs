import assert from 'node:assert/strict';
import { test } from 'node:test';
import { channelCalls, publicChannelsCarryingBroadcastOrPresence } from './house-rules.mjs';

// What each listener in src/lib looks like today, boiled down to the lines the
// rule reads. The rule has to pass the real files; these keep its reasons honest
// when nobody is looking at them.
const postgresChangesOnPublicChannel = [
	'const channel = supabase.channel(`committee-room:${watch.committeeId}:${count}`);',
	"channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);",
	'channel.subscribe();'
].join('\n');

const broadcastOnPrivateChannel = [
	'channel = supabase.channel(setup.topic, { config: { private: true } });',
	"channel.on('broadcast', { event: 'changes' }, ({ payload }) => handleChanges(payload));",
	"void channel.send({ type: 'broadcast', event, payload });"
].join('\n');

test('a public channel that only hears postgres_changes is allowed', () => {
	assert.deepEqual(publicChannelsCarryingBroadcastOrPresence(postgresChangesOnPublicChannel), []);
});

test('a private channel may carry broadcast', () => {
	assert.deepEqual(publicChannelsCarryingBroadcastOrPresence(broadcastOnPrivateChannel), []);
});

test('a broadcast listener on a public channel is reported with its line', () => {
	const text = [
		'// The channel below is what the rule is about.',
		'export function join(supabase) {',
		"\tconst channel = supabase.channel('paper:1');",
		"\tchannel.on('broadcast', { event: 'sync' }, handleSync);",
		'}'
	].join('\n');
	assert.deepEqual(publicChannelsCarryingBroadcastOrPresence(text), [
		{ line: 3, text: "'paper:1'" }
	]);
});

test('tracking presence on a channel written over several lines without private is reported', () => {
	const text = [
		'const channel = supabase',
		"\t.channel('room:1', {",
		'\t\tconfig: { postgres_changes_options: { wait: true } }',
		'\t});',
		'channel.track({ online_at: new Date().toISOString() });'
	].join('\n');
	const found = publicChannelsCarryingBroadcastOrPresence(text);
	assert.equal(found.length, 1);
	assert.equal(found[0].line, 2);
	assert.match(found[0].text, /postgres_changes_options/);
});

test('a generic on<T>() broadcast listener counts as broadcast', () => {
	const text = [
		"const channel = supabase.channel('votes');",
		"channel.on<{ id: string }>('broadcast', { event: 'cast' }, onCast);"
	].join('\n');
	assert.equal(publicChannelsCarryingBroadcastOrPresence(text).length, 1);
});

test('a comment that explains broadcast does not make a postgres_changes file suspect', () => {
	const text = [
		'/**',
		" * Unlike `paper-live-channel.ts`, which uses `.on('broadcast', ...)` on a",
		' * private channel, this file only hears `postgres_changes`.',
		' */',
		"// The old code called supabase.channel('x').on('presence', ...).",
		"const channel = supabase.channel('room:2');",
		"channel.on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, onChange);"
	].join('\n');
	assert.deepEqual(publicChannelsCarryingBroadcastOrPresence(text), []);
});

test('channelCalls balances the parentheses of a call over several lines', () => {
	const text = [
		'x.channel(topic(), {',
		'\tconfig: { private: true }',
		'});',
		"y.channel('b');"
	].join('\n');
	assert.deepEqual(channelCalls(text), [
		{ line: 1, text: 'topic(), { config: { private: true } }' },
		{ line: 4, text: "'b'" }
	]);
});

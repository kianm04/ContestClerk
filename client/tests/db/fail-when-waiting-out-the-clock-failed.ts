import { afterAll, afterEach } from 'vitest';
import { throwIfTheWaitFailed } from './waiting-out-the-clock';

// The "db" project in vite.config.ts loads this file before every database test
// file, which is what `setupFiles` means: the hooks below are then registered
// for every test in that file.
//
// They are here so that a test cannot pass while the harness was never really
// answered. `createFetchThatWaitsOutTheClock` cannot throw when it gives up on
// a Docker clock corrected backwards — `@supabase/postgrest-js` would swallow
// the throw and hand the test an ordinary-looking error — so it records why
// instead, and this is what turns that record into a failure.
// See waiting-out-the-clock.ts and specs/02-architecture/testing.md.

// After every test, so that the failure is reported against the test that met
// it rather than against the run as a whole.
afterEach(throwIfTheWaitFailed);

// And once more at the end of the file, for a wait that failed inside a
// `beforeAll`, where no test was running to be blamed.
afterAll(throwIfTheWaitFailed);

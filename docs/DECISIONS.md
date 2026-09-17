# Engineering decisions and difficulties

These notes describe actual implementation choices. They are not claims of an independent security audit or a fully connected mobile product.

## 1. Keeping coaching within the user's budget

The original aim included a conversational coach. Embedding a hosted model API would introduce a separate API bill, conflicting with the owner's preference to use their existing ChatGPT account. The application therefore generates deterministic reviews, offers copy-and-chat and implements tools for a future direct connection. It never requests an OpenAI API key.

The direct route encountered a real account capability gate. Several manifest declarations were corrected to the supported `capabilities: ["mcp"]` form, but a successful deployment still did not enable the account. The UI now distinguishes implemented code from an activated integration.

## 2. Preventing edits from erasing each other

A browser form, an import and a coach command can all target the same day. Replacing a whole document after reading an old version could lose data. Revision checks reject stale edits, and tool/import writes merge named changes on the server.

Receipts are transactional with the write. This matters when a request succeeds but its response is lost: retrying must not add another workout or meal. The tests simulate competing edits and a failure after receipt creation to verify rollback.

## 3. Treating missing data honestly

Zero steps, no step reading and an unlogged day have different meanings. Missing readings remain undefined, charts show gaps and averages use recorded days. Optional nutrition totals stay unknown when even one meal omits that nutrient. Target comparisons use current goals; historical goals are not stored.

## 4. Making Health imports useful without pretending to have HealthKit

A browser-only app cannot act like the planned native integration. The current bridge uses on-device Shortcuts and an explicit review screen. Steps and water select one source; sleep merges overlapping intervals. The trade-off is manual effort and totals that can differ from Apple's merged display.

A source label is descriptive, not cryptographic attestation. Device permissions, Shortcut installation and the complete iPhone workflow remain outside the automated tests.

## 5. Moving a hosted project into a reusable repository

The app depends on a Sites identity gateway and Cloudflare bindings. A clone therefore needs local emulation and an honest hosting guide, not just an install command. The prepared export removes the owner's deployment ID, personal defaults and fixed private return URL while retaining the app, migrations, tests, lockfile and third-party notices. The original hosted app remains a separate deployment.

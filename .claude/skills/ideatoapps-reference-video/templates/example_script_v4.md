# ideatoapps: I Tested Every "Free Claude Code" Setup (the truth)
16:9 screencast. Narration ElevenLabs Rudra (EitqXD7jgIy0K5Z1zGGp). NO intro joined. DRAFT v4 (~8 min), NOT APPROVED. v3 (4 min, approved earlier) kept as script_v3_approved_4min.md.
VERIFIED FACTS (read 2026-11-26; re-read at record time):
 [F1] FreeLLMAPI README: "10.1 billion tokens per month, 87 free LLM providers", "roughly"; MIT (LICENSE read); Disclaimer "personal experimentation and learning, not production", provider terms still apply; quick start uses Docker one-liner; dev path npm install && npm run dev. I ran it from source (commit 0d64e07).
 [F2] Claude Code docs: any gateway with a supported API format works; Anthropic does not endorse/maintain/audit gateways and does not support routing Claude Code to non-Claude models through any gateway.
 [F3] OpenCode Zen docs: Big Pickle "free for a limited time", team collects feedback "to improve the model"; DeepSeek V4.1 Flash Free / Hy4 flash Free: zero-retention, no training on your data. OpenCode docs page today shows version 2 install lines (curl -fsSL https://opencode.ai/v2/install | bash; npm install -g @opencode/cli). I tested version 1 (npm package opencode-ai, 1.19.6).
 [F5] OpenRouter Claude Code guide (read): "only guaranteed to work with the Anthropic first-party provider"; vars: ANTHROPIC_BASE_URL=https://openrouter.ai/api, ANTHROPIC_AUTH_TOKEN=<your key>, ANTHROPIC_API_KEY explicitly empty; key page openrouter.ai/settings/keys.
 [F7] OUR BENCHMARK (2026-11-26, bench/results.jsonl, all real, fresh folder each run, success checked by us not by the model): simple to-do task x5 per setup: A 5/5 (10.0-22.6 s), B router 5/5 (11.3-22.8 s), C OpenCode Big Pickle 5/5 (17.9-37.6 s). Bug-fix task (inventory.py, 3 bugs, 5 unit tests, 4 failing at start; prompt "fix inventory.py, do not edit the tests"; success = all tests pass AND test file hash unchanged) x3 per setup: A 3/3 (19.2, 16.4, 25.4 s), B 3/3 (21.7, 32.7, 35.9 s), C 3/3 (20.9, 16.7, 25.1 s). 24 of 24 passed. Spend: OpenRouter total_usage $0 of $5.
 [F8] Router during the benchmark: 46 requests logged; 40 to Kilo (keyless), 6 to OVH (keyless, 4 errors). Earlier run: Qwen3.8-27B HTTP 429, gpt-oss-20b x2, nemotron-3.5-lightning; ~12,000 input tokens per request.
 [F9] KEYLESS-OFF test: after disabling the 4 keyless providers (aihorde, kilo, ovh, parallel) in the router, 3 runs: router log shows only OpenRouter (nvidia/nemotron-3.5-lightning:free, 12 requests); all 3 runs produced a working todo.py by our check, but 2 of 3 Claude Code sessions ended in an error (one error_max_turns, one API 429); the 429 text: "Rate limit exceeded: free-models-per-day. Add 5 credits to unlock 1000 free model requests per day". Router: "All models rate-limited ... Soonest cooldown reset ~20h".
 CAVEAT to state: small tasks only; one machine; not a benchmark of real projects; model availability changes daily.

### S01: Cold open
**01.1** [SCREEN] VO: Everyone says Claude Code is free now. Ten billion tokens a month.
Visual: kinetic title wall of real titles, 10.1B count-up with shake [F1]
**01.2** [SCREEN] VO: So I tested it. Twenty-four real runs, three setups, nothing faked.
Visual: three setup cards fly in, counter ticks to 24
**01.3** [SCREEN] VO: Here is the surprise. Every single run passed.
Visual: 24 green ticks fill a grid [F7]
**01.4** [SCREEN] VO: So is free Claude Code the real deal? Stay for what happened when I turned one switch.
Visual: a switch icon, flicker, teaser [F9]
**01.5** [SCREEN] VO: Here is the plan: where to get it, three tests, a harder test, then the switch.
Visual: chapter strip animates, five chips light up in order
**01.6** [SCREEN] VO: The ten billion comes from one README. I checked what it actually says.
Visual: real README screenshot, zoom + highlight [F1]
**01.7** [SCREEN] VO: Quick question. Have you tried it? Yes, no, or stuck?
Visual: poll card
**01.8** [SCREEN] VO: Yes, you will spot the catches. No, you will skip them. Stuck? This one is for you.
Visual: three branches light up in turn

### S02: How it works, and the catch
**02.1** [SCREEN] VO: First, how it works. Claude Code can talk to a gateway instead of Anthropic.
Visual: animated diagram, packets flow Claude Code -> gateway -> model, tagged illustrative [F2]
**02.2** [SCREEN] VO: You set an address and a key. The gateway answers in Claude's format.
Visual: typed env lines, key hidden [F5]
**02.3** [SCREEN] VO: Here is what the videos skip. Anthropic's docs say they do not support this for non-Claude models.
Visual: real docs sentence, cursor glide, highlight [F2]
**02.4** [SCREEN] VO: OpenRouter's own guide says the same: only guaranteed with Anthropic's own provider.
Visual: real OpenRouter guide screenshot, highlight [F5]
**02.5** [SCREEN] VO: So it works, but you are on your own. Remember that.
Visual: THE CATCH stamp

### S03: Where to get it
**03.1** [SCREEN] VO: Three setups. Here is exactly where to get each one.
Visual: three link cards slide in
**03.2** [SCREEN] VO: You need Claude Code installed and an OpenRouter account.
Visual: three requirement chips tick on
**03.3** [SCREEN] VO: Setup one: an account on OpenRouter, and a key from your settings page.
Visual: real OpenRouter docs screenshot with the key-page link highlighted [F5]
**03.4** [SCREEN] VO: Then three variables: the base URL, your key as the auth token, and an empty API key.
Visual: typed variables, third one highlighted "must be empty" [F5]
**03.5** [SCREEN] VO: Setup two is FreeLLMAPI, on GitHub, MIT licensed. The README's quick start uses Docker. I ran it from source.
Visual: real repo page + LICENSE, README quick-start highlighted [F1]
**03.6** [SCREEN] VO: Setup three is OpenCode, from opencode dot ai. It has a version two now. I tested version one, one point nineteen.
Visual: real install page grab, version tag highlighted [F3]
**03.7** [SCREEN] VO: Every link and command is in the description, with the date I checked it.
Visual: description card, date stamp

### S04: Test one, straight to a free model
**04.1** [SCREEN] VO: Test one. Claude Code pointed straight at a free model. Same small task every time: a to-do tool.
Visual: real replay Setup A, typed commands
**04.2** [SCREEN] VO: It writes the file, runs it, adds buy milk. Fifteen seconds on this run.
Visual: real replay, done line [F4 recorded 14.7 s]
**04.3** [SCREEN] VO: I check it myself. Works. And my balance is still five dollars. Zero used.
Visual: real check + credits JSON
**04.4** [SCREEN] VO: Five runs. Five passes. Ten to twenty-three seconds each.
Visual: five timer bars grow, labelled with real seconds [F7]
**04.5** [SCREEN] VO: Some free models did answer with a four two nine, rate limited, when I probed them.
Visual: real probe log, 429 lines highlighted

### S05: Test two, the router
**05.1** [SCREEN] VO: Test two. A router that stacks free tiers behind one address.
Visual: real repo grab [F1]
**05.2** [SCREEN] VO: Its README says ten point one billion tokens a month, across eighty-seven providers. But it says roughly.
Visual: README line highlight, count-up [F1]
**05.3** [SCREEN] VO: That only holds if you have a free key at every provider. And its own disclaimer says: not production.
Visual: "87 keys" card, real disclaimer highlight [F1]
**05.4** [SCREEN] VO: I point Claude Code at it. Model name: auto. Claude Code only ever shows the word auto.
Visual: real replay Setup B, 'auto' highlighted
**05.5** [SCREEN] VO: So I ask the router. Its own log: every request went to one free Nemotron model, through a provider that needs no key.
Visual: real replay of log table, highlight provider [F8]
**05.6** [SCREEN] VO: That log is how you check: provider, model and status, for every request.
Visual: real log row labels highlighted [F8]
**05.7** [SCREEN] VO: In my earlier run, it bounced between three models, and one request failed.
Visual: real DB rows 1-4 animate in [F8]
**05.8** [SCREEN] VO: Each request carried about twelve thousand tokens of my prompt to those providers.
Visual: token count-up, animated packets flowing to provider boxes (illustrative flow, real numbers) [F8]
**05.9** [SCREEN] VO: Sample task, so no harm. Your client's code is a different story.
Visual: THE CATCH stamp

### S06: Test three, OpenCode
**06.1** [SCREEN] VO: Test three. OpenCode, a different agent, with its own free models. No key.
Visual: real replay Setup C, models list [F3]
**06.2** [SCREEN] VO: Big Pickle. Same task. Fourteen seconds, correct file. Five runs, five passes.
Visual: real replay + five bars
**06.3** [SCREEN] VO: A free DeepSeek model hung for four minutes on my first try. I do not know why.
Visual: real saved log, clock
**06.4** [SCREEN] VO: The docs say Big Pickle is free for a limited time, and the team collects feedback to improve the model.
Visual: real Zen docs highlight [F3]
**06.5** [SCREEN] VO: Some free models promise zero retention. Check which, per model.
Visual: real docs highlight [F3]
**06.6** [SCREEN] VO: Next: a harder test. Three bugs, three setups, one race.
Visual: teaser: three terminal frames slide in

### S07: The harder test
**07.1** [SCREEN] VO: Simple tasks are easy. So I made a harder one. A small program with three bugs.
Visual: real code files on screen (inventory.py, test_inventory.py)
**07.2** [SCREEN] VO: Bug one: it adds price and quantity instead of multiplying.
Visual: real line highlighted
**07.3** [SCREEN] VO: Bug two: low stock uses less-or-equal, and forgets to sort.
Visual: real lines highlighted
**07.4** [SCREEN] VO: Bug three: restock should raise an error when the item is missing, and does not.
Visual: real lines highlighted
**07.5** [SCREEN] VO: Five tests, four failing. The prompt: fix the code, do not touch the tests.
Visual: real failing test output (python3 -m unittest, 4 failures)

### S08: The race
**08.1** [SCREEN] VO: Same prompt, all three setups. Three terminals. Three free models. Go.
Visual: split-screen race, three terminals with live timers, replaying the real timings of run one [F7]
**08.2** [SCREEN] VO: Setup one finishes first, nineteen seconds. I run the tests myself. All five pass.
Visual: finish flag, real test output [F7]
**08.3** [SCREEN] VO: Setup three, twenty-one seconds. Pass. The router, twenty-two. Pass.
Visual: finish flags in order [F7]
**08.4** [SCREEN] VO: I check they did not cheat. The test file is byte for byte unchanged.
Visual: real sha256 match [F7]
**08.5** [SCREEN] VO: Three runs each. Nine runs. Nine passes. I did not expect that.
Visual: nine green ticks [F7]
**08.6** [SCREEN] VO: How I score a pass: all five tests pass, and the test file is unchanged. I did not judge code style.
Visual: scoring card [F7]

### S09: The scoreboard
**09.1** [SCREEN] VO: Here are all twenty-four runs. Twenty-four passes. Zero dollars.
Visual: animated bar chart, real seconds per run, zero baseline, units, source tag [F7]
**09.2** [SCREEN] VO: Fastest and slowest: setup one ten to twenty-five seconds. The router eleven to thirty-six. OpenCode seventeen to thirty-eight.
Visual: min/max range bars [F7]
**09.3** [SCREEN] VO: But read the fine print. Two small tasks, one small program, one machine. This is not a benchmark of real projects.
Visual: caveat card
**09.4** [SCREEN] VO: Big codebases and long sessions are different. I did not test those.
Visual: caveat card
**09.5** [SCREEN] VO: And passing is not the whole story. Remember the router log?
Visual: log table returns, open loop

### S10: Turn one switch
**10.1** [SCREEN] VO: Quick guess before I show you. I switch off the keyless providers. Better, worse, or both?
Visual: three-option guess card (answered at once by 09.2)
**10.2** [SCREEN] VO: Both. In the router, I turn those providers off. Only my own OpenRouter key stays on.
Visual: real router API call, four providers show enabled false [F9]
**10.3** [SCREEN] VO: Same task, three runs. Now the log shows one provider. Mine.
Visual: real DB rows, only openrouter [F9]
**10.4** [SCREEN] VO: Better. But look what happened next. Two of the three sessions ended in an error.
Visual: real result lines: ok, error, error [F9]
**10.5** [SCREEN] VO: One ran out of turns. The other hit OpenRouter's daily limit.
Visual: real error text on screen [F9]
**10.6** [SCREEN] VO: The message says: rate limit exceeded, free models per day.
Visual: real error highlighted [F9]
**10.7** [SCREEN] VO: My file still worked. But the session died, and the router said the next reset was about twenty hours away.
Visual: real router message "cooldown reset ~20h" [F9]
**10.8** [SCREEN] VO: That is the trade. Keyless: more models, less privacy. Your key only: more private, and quickly rate limited.
Visual: animated see-saw card, two sides [F8][F9]

### S11: Verdict and how to start
**11.1** [SCREEN] VO: Recap: it works, it is cheap, and the catches are privacy, limits, and no support.
Visual: recap card, three icons
**11.2** [SCREEN] VO: So which one? For learning and throwaway projects, any of them works.
Visual: card, teal
**11.3** [SCREEN] VO: For client or company code, think about where it goes, and read each provider's terms first.
Visual: card, amber
**11.4** [SCREEN] VO: Use your own free keys only. Never someone else's account, never a leaked key.
Visual: policy card
**11.5** [SCREEN] VO: Mistakes to avoid. Leave the API key variable empty, not unset. Check the status screen shows your base URL. Never paste secrets into a free model.
Visual: three mistake cards, real docs lines [F5]
**11.6** [SCREEN] VO: Start with setup one. Three variables, no extra software. Add the router only if you need more models.
Visual: three-step path card
**11.7** [SCREEN] VO: Free models change daily. One run each is not a benchmark. Check your own logs.
Visual: honesty card
**11.8** [SCREEN] VO: Lesson: free is never zero. You pay in limits, privacy, or quality.
Visual: lesson card, kinetic type
**11.9** [SCREEN] VO: Comment which setup I should push harder. Subscribe to ideatoapps. Links and sources are in the description.
Visual: end-screen safe zones

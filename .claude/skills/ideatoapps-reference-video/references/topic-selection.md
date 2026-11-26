# Durable topic selection (vidIQ)
Goal: topics people search for months from now. Run (5 credits each; check `vidiq_balance` first; read `Note:` lines):
1. `vidiq_keyword_research` mode=research on the seed ("claude code tutorial"): volume (0-100), competition (0-100, lower = easier), estimatedMonthlySearch, searchDemandGrowthPct (null = within +-30%).
2. mode=questions on the seed: the literal questions people type ("how to install claude code", "how to use X for free"). These are reference-video titles.
3. `vidiq_outliers` publishedWithin sixMonths, sort=viewCount, minEngagementRate 0.02: long guides that keep earning (e.g. a 48-hour agents course still 116K views after 4 months). `thisMonth` outliers only show spikes: use them for "trend" tags, not for evergreen picks.
4. `vidiq_trending_videos` (recentVph) only to spot spikes and to re-check the day a script starts.
Score each candidate 0-5: Demand (est. monthly searches; >= 50K good), Stability (growth not strongly negative, old videos still earning), Competition (<= 60), Reference-fit (setup, install, compare, cost, limits, cheat-sheet), Demo-feasibility (real run possible in the sandbox/budget, no private accounts), Differentiation (tested numbers others lack). Half-life tag: evergreen (>12 mo), durable (6-12), trend (<3). Weights: Demand .30, Stability .20, Competition .15, Reference-fit .15, Demo .10, Differentiation .10.
## Snapshot 2026-11-26 (re-run before use)
claude code 3.7M/mo (comp 72); claude code tutorial 742K (52); how to get Claude Code for free 622K (43); how to use claude code 542K (53, +30%); claude code skills 210K (52); claude code for beginners 161K (54); how to install claude code on windows 115K (32, +55%); how to make videos with claude code 108K (35); how to install skills in claude code 99K (25); claude code setup 108K (62).
## Cadence (3/week)
Track A setup/install references (install, setup, CLAUDE.md, skills). Track B tested comparisons (free stack retest, Claude Code vs Codex vs OpenCode, DeepSeek real cost, one API key vs subscriptions). Track C build references (first agent, vibe vs agentic coding, loop engineering, reverse engineering with licences read).
Per video: a "reference promise" (commands, table, checklist, test kit someone can reuse) + a re-test date.

## Gap filter (required, added 2026-11-26 after the user's feedback)
Question to answer: "Why would anyone watch us when a big channel already made this?" For each candidate run, 5 credits each:
- `vidiq_outliers keyword=<exact angle> publishedWithin=sixMonths minSubscribers=500000 sort=viewCount limit=6`. Read titles: tutorial/opinion/news vs MEASURED test.
- Decision: SATURATED if >= 3 big-channel videos (>100K views) cover the same angle; OPEN-WITH-ANGLE if they cover the topic but not with measured data; OPEN if none. Only OPEN or OPEN-WITH-ANGLE go forward.
- Limits: vidIQ returns top results by the filter, not the whole platform. Say so; spot-check with `vidiq_youtube_search`.
### Snapshot 2026-11-26 (big channels = 500K+ subs, last 6 months)
SATURATED: how to install skills in Claude Code (Nick Saraev 546K, Tech With Tim 368K, freeCodeCamp 254K); n8n/first AI agent free 24/7 (Metics Media 947K, freeCodeCamp 184K, Ayushman Pandita 128K, Kevin Stratvert Hermes 109K); generic Claude Code tutorials/courses.
COVERED BUT NOT MEASURED (open with angle): free Claude Code (Nishant Chahar 183K, tutorial only); vibe vs agentic coding (IBM 329K, Telusko 214K, Tech With Tim 206K: opinion, no test); Codex vs Claude (opinion); model price/cost talk (no measured cost per task).
## Our lab angle (what makes people come back)
Standard small tasks + a checker we run + hash/test checks + cost/spend logs + raw logs on screen + downloadable kit + dated re-tests (monthly leaderboard). Each new model/tool release = run the kit, publish the first measured result.

# Token efficiency (applies to every repo that uses this skill)

## Measured (ccusage 20.0.51, MIT, local read-only; this project, Nov 2026)
About 466M tokens in ~6 days, of which ~95% were CACHE READS (the long conversation re-read on every turn, including by forked builders that inherit it). Output was only ~1.2M. Estimated list cost ~$143 (an estimate, not a bill). So the biggest levers are context size and turn count, not command-output size.

## Rules (biggest savings first)
1. **Fresh session per task/batch.** When a conversation is long (hundreds of turns), start a new session; memory (`CLAUDE.md`, `memory/`) and this skill carry the knowledge. Do not keep one thread for a whole project.
2. **Builders are FRESH agents, not forks.** A fork inherits the whole conversation (hundreds of thousands of tokens re-read per tool round). Use a fresh agent (`model: sonnet`, or `haiku` for simple work) with a self-contained brief that says "load the faceless-video-studio skill". Forks only when the context is genuinely needed.
3. **Fewer turns.** Every background notification, hook-forced commit and one-line status reply re-reads the whole context. Have builders commit and push their own files as they finish a step; batch status replies; do not poll.
4. **Small images.** Use one contact sheet per video (<= ~1500 px wide, 10x3 tiles) instead of many sheets; do not re-read an image you already saw; prefer scripts that print numbers (`scripts/qc_video.sh`) over screenshots.
5. **Short outputs.** Pipe command output through `head`/`tail`/`wc`; never `cat` big files; use Grep/Glob/Read with limits.
6. **Keep CLAUDE.md short** (< ~100 lines); move detail into skills/references that load only when needed.
7. **Do not read generated files**: `node_modules`, `build/`, media (`*.mp4 *.mov *.wav`). `.claude/settings.json` denies Read on node_modules, *.mov and *.wav. Do NOT deny *.mp4: the file-send tool needs to read finished videos.
8. **Plan before big builds**; reuse templates (the skill's styles catalog) instead of re-deriving the design each time.
9. **Measure**: `scripts/token_report.sh` (ccusage pinned) shows daily/session totals; check after each batch.

## Third-party output compressors (RTK, chop, sqz, squeez, lowfat, ContextZip, CTK, claude-compress...)
Public, young projects; they wrap or rewrite Bash output through a PreToolUse hook; savings claims are self-reported (60-95% of command output only, not end-to-end). Risks: a hook that rewrites every command can hide output you need (QC logs, errors) and is a supply-chain risk. Not installed by default. Trial only on a throwaway branch/session, pin a version, read the code and licence, compare with `token_report.sh`, and keep it only if the totals really fall.

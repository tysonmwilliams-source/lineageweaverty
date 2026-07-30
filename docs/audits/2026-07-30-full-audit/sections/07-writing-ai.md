# Subsystems: Writing Studio & AI Assistant

## Inventory

**Writing Studio — pages & editor**

| File | LOC | Purpose | Verdict |
|---|---|---|---|
| `pages/WritingStudio.jsx` | 628 | Project grid, create/delete, filters, stats | Sync payload wrong; cascade-delete leaks cloud docs; N+1 chapter count |
| `pages/WritingEditor.jsx` | 778 | 3-column shell, chapters, autosave, 5 panel modes | **Chapter-switch data-loss race; save-per-keystroke; no Ctrl+S / beforeunload** |
| `pages/WritingEditor.css` | 506 | 240px chapters / flex prose / 380px tools | ~35 lines dead; tools panel hidden <1200px |
| `pages/WritingStudio.css` | 606 | Card grid | OK |
| `writing/Editor/TipTapEditor.jsx` | 256 | TipTap v3 wrapper | **v2 setContent signature; dead history config** |
| `writing/Editor/WikiLinkExtension.js` | 156 | `[[…]]` atom node + Suggestion plugin | Clean. Phantom dep on @tiptap/suggestion |
| `writing/Editor/WikiLinkSuggestion.jsx` | 228 | Autocomplete dropdown | Dead createPortal import |
| `writing/Editor/EditorToolbar.jsx` | 276 | Formatting + dictation | Active states stale on cursor move |
| `writing/Sidebar/EntitySidebar.jsx` | 255 | Referenced-entity panel | **Never refreshes; N+1 full-table scans** |
| `writing/ReferenceBrowser/ReferenceBrowser.jsx` | 636 | Browse people/houses/codex/dignities | **6 wrong field names -> previews render empty**; no virtualization |
| `writing/CanonCheck/CanonCheckPanel.jsx` | 253 | Issue list UI | **Best-built component in scope** |
| `writing/WritingWizard/WritingWizard.jsx` | 512 | Prose Polish + Craft Coach | **Full analysis every keystroke; setState inside useMemo** |
| `writing/ExportModal.jsx` | 158 | md/html/txt/json export | Dead AnimatePresence import; no DOCX/EPUB |

**Writing Studio — planner**

| File | LOC | Purpose | Verdict |
|---|---|---|---|
| `Planner/PlotThreadsView.jsx` | 921 | Thread master-detail | **Zero sync**; 421 over limit; ~65% boilerplate |
| `Planner/StoryPlannerDashboard.jsx` | 882 | Framework picker, progress, AI | **Zero sync**; 382 over |
| `Planner/CharacterArcsView.jsx` | 846 | Ghost/Want/Need + milestones | **Zero sync**; 346 over |
| `Planner/StoryArcsView.jsx` | 819 | Arc master-detail | **Zero sync**; 319 over |
| `Planner/BeatSheetView.jsx` | 724 | Act-grouped beat cards | **Zero sync**; dead "list" view mode |
| `Planner/TimelineView.jsx` | 563 | Zoomable timeline, drag scene->beat | **Drag result never synced** |
| `Planner/PlanningSidebar.jsx` | 544 | In-editor planning context | **Best planner UX**; effect deps on object |
| `Planner/OutlineView.jsx` | 482 | Act>Chapter>Scene tree | Act assignment is a heuristic; N+1 POV lookups |
| `Planner/SceneCard.jsx` / `StoryPlannerModal.jsx` | 275 / 247 | | OK |
| Planner CSS (10 files) | 7,858 | | Massively duplicated BEM blocks |

**Services**

| File | LOC | Purpose | Verdict |
|---|---|---|---|
| `services/planningService.js` | 1167 | All 6 planner entity CRUD | **No dataSyncService import at all**; 767 over; 61 console.logs |
| `services/planningAIService.js` | 868 | 14 Gemini planning prompts | Same fragile JSON regex x12; 4 functions dead |
| `services/proseAnalysisService.js` | 658 | Rule-based prose critique | Pure & testable, but O(n·56) regex compiles; dialogue-hostile |
| `services/canonCheckService.js` | 577 | Rule + AI canon validation | **2 of 4 rule checks dead from wrong field names**; runFullCanonCheck unused |
| `services/writingService.js` | 293 | Writing CRUD | Auto-creates unsynced chapter |
| `services/writingLinkService.js` | 287 | Wiki-link persistence | **syncChapterLinks never touches the cloud** |
| `services/chapterService.js` | 334 | Chapter CRUD + reorder | Word-count & reorder writes unsynced |
| `services/exportService.js` | 406 | 4 export formats | OK |
| `hooks/useAutoSave.js` | 115 | Debounced autosave | **Debounce completely defeated** |

**AI Assistant**

| File | LOC | Purpose | Verdict |
|---|---|---|---|
| `services/aiAssistantService.js` | 510 | Gemini transport + proposal parsing | **No retry/timeout/streaming; ignores finishReason; duplicate parser** |
| `services/aiDataService.js` | 904 | Full-dataset context builder | N+1 tenure loads; standard level omits codex/heraldry the prompt claims |
| `services/aiProposalService.js` | 682 | Validation + diff | **Well-designed**; enrichProposal/generateProposalDiff largely dead |
| `services/aiProposalExecutor.js` | 535 | Execute approved proposals | **Broken at the call site**; no cloud sync on 4 of 6 entity paths |
| `components/AIAssistant.jsx` | 470 | Chat overlay + proposals | **Hardcoded datasetId:'default'**; no history; plain-text markdown |
| `components/AIProposalCard.jsx` | 264 | Proposal card UI | OK |

## Part A — Autonomously fixable

**[CRITICAL] The entire Story Planner writes to IndexedDB only — and the next login DELETES it**
`services/planningService.js` (whole file, `grep -c dataSyncService` = 0); all 8 stateful Planner components (no useAuth import anywhere under `src/components/writing/`).
`dataSyncService.js:1604-1936` implements 21 sync functions for the planner entities. A repo-wide grep for callers outside dataSyncService returns **zero**. ~35 mutation handlers violate the GOLDEN RULE: `PlotThreadsView.jsx:158,178,192,208,220,240,253,270,287,302`; `CharacterArcsView.jsx:140,177,191,205,225,238,270`; `StoryArcsView.jsx:158,178,192,208,220,237,257`; `BeatSheetView.jsx:173,198,220,233,246`; `TimelineView.jsx:189`; `OutlineView.jsx:164,184`; `StoryPlannerDashboard.jsx:128,147,159`.
**This is worse than "not backed up."** The syncQueue is only ever written from inside those wrappers (`dataSyncService.js:913-1937` are the only addToSyncQueue callers), so `getPendingChangeCount()` is **structurally blind** to planner edits. The data-loss guard at `dataSyncService.js:662-666` therefore returns 0, and initializeSync falls through to scenario 3/4 at `:682`: `await localDeleteAllData(dsId, {clearSyncQueue:true})` — which clears storyPlans, storyArcs, storyBeats, scenePlans, characterArcs, plotThreads (`database.js:1258-1263`) — then repopulates from a Firestore subtree that was never written.
Failure: novelist picks Save the Cat, fills 15 beats, 12 scenes, 6 plot threads, 4 character arcs over a week. Closes the tab. Next session AuthProvider restores -> initializeSync sees cloud people/houses and 0 pending changes -> wipes local -> **the entire plan is gone, no warning, no undo.**
Fix: (1) import the 21 sync fns into planningService and call them per create/update/delete, taking userId, mirroring `dignityService.createDignity(data, userId, datasetId)` (`:557`); (2) thread `useAuth().user?.uid` into all 8 views; (3) add `arcMilestones` to deleteAllData (`database.js:1258-1263` omits it — orphans survive the wipe then collide with restored IDs); (4) add arcMilestones cascade to deleteStoryPlan (`planningService.js:282-286` deletes 5 tables, not 6). Effort L.

**[CRITICAL] useAutoSave saves on every keystroke — the 1500ms debounce does nothing**
`hooks/useAutoSave.js:96-107`. The cleanup's dep array is `[data]`, so React runs it before *every* re-run, not just unmount. Each keystroke produces a new pendingSaveData object (`WritingEditor.jsx:322`), the cleanup fires, sees the JSON differs from `lastSavedDataRef` (only performSave updates that ref), and calls onSave **synchronously and immediately**. Then the debounce timer at `:83` fires 1500ms later and saves again.
Per keystroke: one `db.chapters.update` with the full TipTap JSON; one `deleteLinksByChapter` + N `writingLinks.add` (`writingLinkService.js:176-190`); one `updateWritingWordCount` -> `db.writings.update`; one `syncUpdateChapter` -> addToSyncQueue + a Firestore setDoc of the whole chapter (`WritingEditor.jsx:174`). **At 60 WPM that's ~300 Firestore writes/minute of a 150-400 KB document.** Cost and quota exposure are real; so is the jank.
Fix: deps `[]` + read latest data from a ref. Effort S.

**[CRITICAL] Switching chapters within the debounce window writes chapter A's prose into chapter B**
`WritingEditor.jsx:155-200`, `useAutoSave.js:83-85`. `saveChapterContent` closes over activeChapterId (dep at `:192`) and is mirrored into onSaveRef every render (`useAutoSave.js:35-37`). The pending timer closes over data (chapter A) but resolves through onSaveRef.current (now bound to B).
Type in Ch1 -> timer armed -> click Ch2 within 1500ms -> saveChapterContent rebinds to 2 -> timer fires -> `updateChapter(2, {content: A.json, …})`. **Chapter 2 is overwritten with Chapter 1's text**, and syncChapterLinks(2, …, A's links) rewrites Ch2's links too.
Fix: capture the chapter id alongside the payload; write to `data.chapterId`. Also flush (saveNow) before changing activeChapterId in handleSelectChapter (`:264`). Effort S.

**[CRITICAL] Every approved AI proposal either silently no-ops or writes data and then reports failure**
`AIAssistant.jsx:223-226` -> `aiProposalExecutor.js:85-159`. `executeProposal(proposal, context)` expects `createExecutionContext()`'s shape (`:57-74`); the only caller passes a bare `{genealogyContext, datasetId:'default'}`, so `context.currentData` and `context.rollbackStack` are undefined.
- update/delete/relationship-create/link: `:91` `validateProposal(proposal, undefined)` -> `validateUpdateProposal:325` evaluates `currentData.lookupMaps?.peopleById?.get(...)`. The `?.` sits **after** `.lookupMaps`, so reading `.lookupMaps` off undefined throws TypeError. Validation is **outside** the try (which starts at `:104`), so the throw escapes to `AIAssistant.jsx:254` and the card flips to failed. **These never execute at all.**
- person/house/codex create without a houseId: validation squeaks through, captureRollbackData skips (`:436` handles only update/delete), the switch at `:107` **performs the real DB write**, then `:137` `context.rollbackStack.push(...)` throws -> caught at `:149` -> returns `{success:false}`. **The user sees "Failed", clicks Approve again, and gets a duplicate person.**
Fix: build the context once in handleApproveProposal/handleApproveAll; move validateProposal and captureRollbackData inside the try; guard `rollbackStack ??= []`. Also surface `executeRollback` — it exists (`:471`) and has no callers, so the advertised "Rollback data is stored for potential undo" (`:10`) is untrue. Effort M.

**[CRITICAL] AI Assistant always reads and writes dataset 'default'**
`AIAssistant.jsx:83` (getDataSummary no arg), `:111` (no datasetId, defaults to 'default' at `aiAssistantService.js:271`), `:225` (literal `'default'`). AIAssistant is mounted globally from `Navigation.jsx:248` on every page and never calls useDataset(). A user in a second world gets analysis of the *first* world's data, and any approved proposal executes against `LineageweaverDB` instead of `LineageweaverDB_{id}`. Effort S.

**[HIGH] syncChapterLinks never reaches the cloud — syncAddWritingLink/syncDeleteWritingLink are dead**
`writingLinkService.js:176-190`, called from `WritingEditor.jsx:170`. Both exist (`dataSyncService.js:1570, 1586`) with zero callers repo-wide. Every `[[wiki-link]]` is local-only; after the initializeSync wipe-and-restore, EntitySidebar, getReferencedEntities and every rule-based canon check see an empty writingLinks table — the Referenced Entities panel goes blank and canon check reports "no issues" because it has nothing to check. Fix: accept userId and sync per link (better: diff old vs new rather than delete-all-recreate, which also removes a per-keystroke write amplifier). Effort S.

**[HIGH] Writing word count updates locally but never syncs**
`chapterService.js:127-133` -> `writingService.js:224-227` -> a `db.writings.update` with no syncUpdateWriting. Same for the deleteChapter path (`chapterService.js:194`). Firestore's `currentWordCount` stays at 0; after a restore the dashboard shows "0 words" and the Total Words stat (`WritingStudio.jsx:436`) reads 0 for a finished novel. Effort S.

**[HIGH] syncAddWriting uploads the modal form values, not the created record**
`WritingStudio.jsx:406` sends `{title, type, synopsis}` from CreateWritingModal (`:176`); createWriting (`writingService.js:62-73`) persists 11 fields including status, tags, currentWordCount, createdAt, updatedAt. The Firestore doc has no updatedAt, so on restore `WritingCard:81` renders **"Invalid Date"**, the default sort (`sortBy:'updated'`, `:390`) produces NaN comparators and arbitrary ordering, and the status select (`WritingEditor.jsx:579`) becomes uncontrolled. Fix: re-read the created record and sync that. Effort S.

**[HIGH] Deleting a writing orphans its chapters and links in Firestore**
`WritingStudio.jsx:413-422` calls deleteWriting (which locally deletes chapters + writingLinks, `writingService.js:170-180`) but only syncDeleteWriting. **The cloud copies of every chapter — the actual prose — survive forever**, and on next download are restored as chapters of a nonexistent writing: invisible in the UI but counted in getAllChapters. The story plan/arcs/beats/threads aren't deleted either, locally or remotely. Effort M.

**[HIGH] createWriting's auto-generated Chapter 1 is never synced**
`writingService.js:78-91` inserts directly; `WritingStudio.handleCreate:398` never calls syncAddChapter. The editor papers over it at `WritingEditor.jsx:219-234` by creating *another* Chapter 1 when it finds none — so a synced-then-restored writing quietly loses its original chapter and gets a fresh empty one. Same class: `chapterService.deleteChapter:189-191` renumbers survivors locally with no syncUpdateChapter, so cloud chapter order drifts after any deletion. Effort S.

**[HIGH] `house.name` does not exist — the `[[…]]` autocomplete cannot find houses**
Schema is `houses: '++id, houseName, …'` (`database.js:525`); `house.houseName` is used 81x, `house.name` 11x — all in entitySearchService and canonCheckService.
- `entitySearchService.js:107` `const name = (house.name || '').toLowerCase()` -> always `''` -> false for any query. **Typing `[[Stark` returns no houses.** Houses are reachable only by matching their motto.
- `:114, 221, 300` `house.name || 'Unnamed House'` -> every surfaced house renders "Unnamed House", **and that string is stored as the wiki-link label.**
- `canonCheckService.js:151` `if (!house.name || house.name.length < 3) continue;` -> the unlinked-house detection loop (`:151-167`) is 100% dead.
- `canonCheckService.js:311` the AI canon prompt emits `- House undefined`.
Effort S.

**[HIGH] `person.deathYear`/`birthYear` don't exist — the lifespan canon check is dead and the AI gets no dates**
Schema is dateOfBirth/dateOfDeath (`database.js:524`).
- `canonCheckService.js:188` always false -> `checkCharacterLifespans` (`:176-204`) always returns []. **Timeline validation, the headline canon-check feature, does nothing.**
- `:302-303` the referenced-character block never emits birth/death years, so the AI is asked to find "characters alive at wrong times" (`:342`) with no dates. It will confabulate.
- `checkDignityTenures` (`:209-241`) does no conflict checking at all — one boilerplate INFO note per referenced dignity (`:229-237`). `getTenuresForPerson` is imported at `:10` and never called.
**This is the real content behind CLAUDE.md's "AI canon check is partially stubbed" — the AI call path works fine; the context feeding it is broken.** Effort M.

**[HIGH] TipTap v2 setContent signature — chapter switches emit a spurious update**
`TipTapEditor.jsx:226` `setContent(content || '', false)` with a comment claiming emitUpdate:false. In TipTap 3.15.3 the signature is `setContent(content, options?)` and the implementation destructures `{emitUpdate = true} = options`. Destructuring `false` yields undefined -> defaults to **true**. Every chapter switch fires onUpdate -> setPendingSaveData -> an immediate save (via the bug above) of content just loaded, and rewrites all wiki-links.
Related v2 leftover at `:139-143`: `StarterKit.configure({history: {...}})` — v3 renamed it to `undoRedo`, so depth/newGroupDelay are silently ignored. Also add `@tiptap/suggestion` to package.json — imported at `WikiLinkExtension.js:10`, resolves only transitively via @tiptap/extension-mention. Effort S.

**[HIGH] Writing Wizard re-runs full prose analysis on every keystroke, synchronously, during render**
`WritingEditor.jsx:729` passes `plainText={editor?.getText() || ''}` — computed fresh each render, and WritingEditor re-renders every keystroke via setPendingSaveData. `WritingWizard.jsx:148-166` memoizes on `[plainText]`, which changes every keystroke.
Cost per run (`proseAnalysisService.js`): splitIntoSentences executed **7 separate times** (`:163, 201, 241, 273, 338, 398, 475`); detectAdverbs constructs `new RegExp` inside a nested loop — sentences x 56 adverbs (`:205`); detectFilterWords sentences x 56 (`:246`). A 3,000-word chapter is ~200 sentences -> **~22,000 regex compilations plus 22,000 executions on the main thread, per keystroke**, while the panel is open. Plus `setLastAnalysis(new Date())` at `:164` is a setState inside useMemo.
Fix: debounce plainText into state (300ms) in WritingEditor rather than reading during render; precompile the adverb/filter regexes once at module scope as single alternations; split sentences once; move setLastAnalysis into a useEffect. Effort M.

**[HIGH] Gemini calls have no timeout, no abort, no retry, and swallow truncation and safety blocks**
`aiAssistantService.js:47-99` and `:344-380` (duplicated).
- No AbortController/signal. A hung request leaves isCheckingCanon/isAIAnalyzing/isLoading stuck true forever with no cancel.
- No retry on 429/503. Free tier rate-limits aggressively; the user just sees "Gemini API error".
- `finishReason` never inspected. A MAX_TOKENS truncation returns a partial string, fed straight to JSON.parse, reported as "Invalid response format" rather than "response was cut off".
- Safety blocks produce no candidates -> `:93/:376` yields undefined -> `:96` throws the generic "No response generated". `data.promptFeedback.blockReason` is available and ignored. **This will bite constantly: it's a fantasy-fiction tool and the four BLOCK_MEDIUM_AND_ABOVE thresholds (`:64-81`) will block ordinary battle and intrigue prose sent through the Craft Coach.**
- The key is passed as a URL query param rather than the `x-goog-api-key` header, so it lands in any proxy/devtools log.
- The two request builders are byte-identical; `parseProposalsFromResponse` here (`:445`) is a second, weaker copy of `aiProposalService.js:125` — the local one skips enrichProposal, so proposals reaching the UI have no severity and no default preview, and PROPOSAL_TYPES/ENTITY_TYPES validation never runs.
Fix: one `callGemini({prompt, generationConfig, signal, retries})` with a 60s AbortSignal.timeout, backoff on 429/503, header auth, finishReason/blockReason surfacing; delete the duplicate parser. Effort M.

**[HIGH] Structured output is extracted by regex from free text, 12 times over, with no schema**
`planningAIService.js:72, 138, 195, 262, 318, 376, 435, 484, 550, 631, 703, 755` plus `canonCheckService.js:432-443` and the fenced variant at `aiAssistantService.js:447` all do `response.match(/\{[\s\S]*\}/)` then JSON.parse.
1. The prompts say "Respond ONLY with valid JSON", but they're routed through askGemini, which **prepends a conflicting persona**: buildPromptWithContext (`aiAssistantService.js:110-112`) wraps every prompt with *"You speak with a slightly medieval/formal tone befitting a royal counselor"* and reframes the caller's prompt as `User Request:`. **You are asking for machine-parseable JSON while instructing the model to talk like a herald.**
2. The regex is greedy first-`{` to last-`}`. Truncation removes the closing brace, the match fails entirely, user gets "Invalid response format". generateBeatSuggestions (15 beats x 7 fields at maxOutputTokens 2048) and developCharacterArc are likeliest to trip.
Fix: a `raw: true`/systemInstruction option so structured calls skip the persona, and `generationConfig.responseMimeType: 'application/json'` + responseSchema so Gemini enforces the shape server-side and the regex disappears. Effort M.

**[HIGH] The AI chat has no memory — every turn re-uploads the whole world**
`AIAssistant.jsx:111` sends only currentInput; the messages array (`:32`) is display-only; askGeminiWithFullContext builds a single-part contents array (`aiAssistantService.js:350-354`). "Expand on that" / "do the second one" cannot work. Each turn re-runs collectFullDataContext (a full read of 7 IndexedDB tables plus **one getTenuresForPerson query per person** — `aiDataService.js:145-154`, an N+1) and re-uploads up to 40,000 tokens (`:293`). **Ten chat turns ~= 400k input tokens for a conversation the model can't remember.** Fix: build contents from history, move the persona to systemInstruction, cache the context per dataset with mutation invalidation, put the world dump in the system instruction so context caching can apply. Effort M.

**[MEDIUM] The AI's advertised "FULL READ ACCESS" is false at the default context level**
`aiAssistantService.js:206-211` tells the model it has full access to codex entries, heraldry, dignities. But contextLevel defaults to 'standard' (`:273`), and formatStandardContext (`aiDataService.js:494-533`) emits only houses, people and dignity one-liners. Codex entries and active disputes appear only in formatFullContext (`:538-563`), which nothing requests. Heraldry appears nowhere beyond a `| Has heraldry` flag (`:660`). **So the "Audit heraldry" and codex quick-actions (`AIAssistant.jsx:339`) ask the model to reason about data it was never given, and it will invent it.** Effort S.

**[MEDIUM] Referenced Entities panel never refreshes, and does N full table scans to render**
`EntitySidebar.jsx:157` deps `[writingId, datasetId, links.length]`, where links is set *by the effect itself* (`:119`) — a redundant second fetch on mount and no signal when links change on disk. Insert a `[[link]]`, watch it save, and the panel stays stale until you leave and come back. `:138-146` then calls getEntityById once per unique entity, each doing a full getAllPeople/getAllHouses (`entitySearchService.js:200, 215`). **30 referenced characters = 30 full table reads.** Same N+1 at `canonCheckService.js:90` and `:261`. Effort S.

**[MEDIUM] Reference Browser previews are mostly blank — six wrong field names**
`ReferenceBrowser.jsx`: `person.birthYear` (93, 96), `person.deathYear` (100, 103), `person.biography` (107, 110); `house.seat` (184) — model has seatName; `house.region` (191) and `house.history` (198) don't exist at all. grep confirms these six identifiers appear nowhere else. **Click a person and you get a name and nothing else — in the panel whose entire purpose is "check a fact without leaving the page".** Also unbounded: every entity rendered as a DOM node (`:581`), no virtualization. Effort S.

**[MEDIUM] Toolbar active states don't update when the cursor moves**
`EditorToolbar.jsx:150,156,162,174,180-193,204,210,222` read `editor.isActive(...)` during render, but the component only re-renders when its parent does, and the parent only re-renders on onUpdate (document change). Click into an existing bold word and the Bold button stays dark. Fix: `useEditorState` (v3) or subscribe to selectionUpdate/transaction. Effort S.

**[MEDIUM] Gemini markdown rendered as raw text in the chat** — `AIAssistant.jsx:386` `{message.content}`; Gemini returns `**bold**`, `###`, `- ` and the user reads the asterisks. `marked` and `dompurify` are already dependencies. `WritingWizard.jsx:370-393` hand-rolls a three-case markdown mini-parser instead. Effort S.

**[MEDIUM] AI proposals bypass cloud sync for dignity, heraldry, and codex**
`aiProposalExecutor.js:314-416`. createDignity/updateDignity/createHeraldry self-sync **only when userId is truthy** (`dignityService.js:835`, `heraldryService.js:100`), but createExecutionContext defaults `userId = null` (`:60`) and `AIAssistant.jsx:223` never supplies one. codexService has no sync path at all. Person/house/relationship are safe *only* because genealogyContext is passed and its methods sync internally (`:214, 249, 285`) — the raw-db fallbacks at `:217,224,232,252,259,267,288,295,303` have no sync either. Effort M.

**[MEDIUM] No unsaved-changes guard and no manual save in the editor**
`WritingEditor.jsx:195` destructures `saveNow` and never uses it. No beforeunload listener, no Cmd/Ctrl+S, and navigating back via the arrow at `:570` relies on the (mis-wired) unmount save. The header does show a live Saving/Saved/Unsaved indicator (`:589-599`) — good, but not backed by a flush path. Effort S.

**[MEDIUM] Massive copy-paste across the five Planner views**
PlotThreadsView (921) ~65-70% boilerplate, StoryArcsView (819) ~65%, CharacterArcsView (846) ~55%, BeatSheetView (724) ~50%, Timeline/Outline ~25-30%. Near-identical line ranges:

| Concern | PlotThreads | CharacterArcs | StoryArcs |
|---|---|---|---|
| state block | 79-84 | 68-79 | 68-74 |
| loadData | 122-145 | 82-106 | 126-151 |
| create | 158-175 | 140-158 | 158-175 |
| update | 178-189 | 177-188 | 178-189 |
| delete | 192-205 | 191-202 | 192-205 |
| status change | 208-217 | 269-279 | 208-217 |
| AI suggestion | 302-340 | 238-267 | 257-284 |
| loading return | 365-372 | 282-289 | 315-322 |
| header | 377-401 | 294-321 | 327-351 |
| empty state | 405-418 | 327-344 | 357-368 |
| sidebar list | 422-459 | 348-380 | 372-423 |
| add/edit modals | 696-846 | 709-759 | 617-814 |

Plus 7,858 lines of CSS repeating `__header`/`__content`/`__empty`/`__modal-backdrop`/`__form-group`/`__form-actions`/`__status-btn` under three BEM prefixes.
Proposed: `usePlanningEntity(config)` where config = `{getAll, create, update, remove, syncAdd, syncUpdate, syncDelete, autoSelectFirst}` -> `{items, current, selectedId, setSelectedId, loading, create, update, remove, reload}`. Removes ~180 lines per view **and is the natural place to enforce the sync rule once.** Plus `<PlannerMasterDetail>` (header + count + add + list + empty, taking renderListItem/renderDetail), `<PlannerFormModal fields={[...]}>`, `useAISuggestion(suggestFn, applyFn)` for the pattern repeated 5x (incl. `PlanningSidebar.jsx:123-142`), and move the four local colour maps (`PlotThreadsView.jsx:35-51`, `CharacterArcsView.jsx:50-56`, `StoryArcsView.jsx:35-40`, `BeatSheetView.jsx:50-61`) onto the existing THREAD_TYPES/ARC_TYPES in `planningService.js:113-141`.
Realistic outcome: **3,873 lines of view code -> ~1,400; 7,858 CSS -> ~3,000.** Effort L.

**[LOW] Planner correctness papercuts**
- `planningService.js:264, 394, 514, 665, 794, 910` — `updates.updatedAt = ...` **mutates the caller's object**; a component passing a state slice gets it silently modified.
- `:813, 929` — `id: Date.now()` for embedded milestone/plant ids collides on rapid adds.
- `PlotThreadsView.jsx:543, 567` — parseInt on a select with an empty placeholder writes NaN into setupSceneId.
- `PlotThreadsView.jsx:630`, `StoryArcsView.jsx:553` — `characters.slice(0, 20)` silently truncates with no "+N more".
- `BeatSheetView.jsx:83, 553-560, 648` — the cards/list viewMode toggle only swaps a CSS class; no list branch exists.
- `planningService.js:43` — Save the Cat's "Setup" beat has targetPercent 1 while "Theme Stated" has 5, so TimelineView renders them out of canonical order.
- `:541-559, 692-717` — reorderStoryBeats and reorderScenePlans have zero callers; `StoryArcsView.handleMoveArc:248-249` reinvents reordering with two separate updates.
- The arcMilestones table, its 3 sync functions and its Firestore collection (`firestoreService.js:932-984, 1247`) are entirely unwritten — milestones live as an embedded array on characterArcs (`planningService.js:735, 806-828`).
- planningAIService: developPremise, generateBeatSuggestions, developScene, developCharacterArc, strengthenBeat have zero JSX callers. `canonCheckService.runFullCanonCheck:520-550` (incl. its dedupe) is dead — `WritingEditor.jsx:441-456` concatenates rule + AI issues itself with no dedupe.
- Dead imports: getAllCodexEntries (`canonCheckService.js:9`), getHeraldryForEntity/getCodexStatistics/getHeraldryStatistics/getDignityStatistics (`aiDataService.js:23,29,35`), createPortal (`WikiLinkSuggestion.jsx:8`), AnimatePresence (`ExportModal.jsx:8`).
- Dead CSS: `.placeholder-editor*`, `WritingEditor.css:277-317`.
- `aiDataService.js:369` heraldryStats.unlinked initialized to 0, never computed. `:212-245` handle 'child', 'sibling', 'married' relationship types **that don't exist in the data model**.
- Deprecated `substr` at `aiAssistantService.js:458`, `aiProposalService.js:190`, `canonCheckService.js:448`.

**[LOW] File-size violations and console noise**
Over CLAUDE.md limits: planningService 1167 (+767), PlotThreadsView 921 (+421), aiDataService 904 (+504), StoryPlannerDashboard 882 (+382), planningAIService 868 (+468), CharacterArcsView 846 (+346), StoryArcsView 819 (+319), BeatSheetView 724 (+224), aiProposalService 682 (+282), proseAnalysisService 658 (+258), ReferenceBrowser 636 (+136), canonCheckService 577 (+177), TimelineView 563 (+63), PlanningSidebar 544 (+44), aiProposalExecutor 535 (+135), WritingWizard 512 (+12), aiAssistantService 510 (+110).
~181 unguarded console.* in scope — planningService alone has 61, incl. decorative success markers on every mutation.

**[LOW] Prose analysis quality bugs**
`proseAnalysisService.js:175` — `sentence.match(new RegExp(...))` returns the *first* occurrence, not the one at index i, so a sentence with two identical passive constructions reports the same text twice. `:314` — `if (wordPositions[cleanWord])` treats index 0 as absent. `:414` — `if (count >= 2)` is unreachable-false given the enclosing condition. `:575` — splitting on `(?<=[.!?])\s+` treats `"Stop!" she said.` as two sentences, **skewing avgSentenceLength, passiveVoicePercent and detectSentenceStarts on any dialogue-heavy page — i.e. most fiction.**

## Part B — Needs user input

**B1. The Gemini API key ships to every browser.** `VITE_GEMINI_API_KEY` is inlined at build time (`aiAssistantService.js:21`) and appended to the request URL (`:47`). Unlike the Firebase config — genuinely browser-safe because firestore.rules enforces authorization — **a Gemini key IS the authorization.**
- *Local-only tool, accept the risk.* Zero work. Correct if never hosted publicly and each user supplies their own key — then the right move is to *drop* the env var and add a Settings field storing the key in IndexedDB per user, which also lets the user pick their own quota.
- *Minimal proxy.* One Cloud/Vercel Function holding the key, called with the Firebase ID token. Breaks the "no backend of our own" principle and adds a deploy target, but it's ~60 lines and gives rate limiting, retry and per-user quotas in one place.
- *Firebase AI Logic (Vertex AI in Firebase).* Purpose-built: the SDK authenticates with the user's Firebase credentials, no key in the client, App Check for abuse prevention. Already all-in on Firebase, no new vendor. Costs a transport rewrite and a Blaze billing account.

**B2. Model pinning and the v1beta endpoint.** `gemini-2.5-flash` hardcoded in one string (`aiAssistantService.js:22`) against v1beta. (a) pin and forget; (b) **extract `src/config/aiConfig.js` with MODEL_ID, API_VERSION and per-task overrides** (cheaper model for getQuickSuggestion, stronger for detectPlotHoles) — one-line upgrades thereafter and per-feature cost tuning; recommended regardless; (c) user-selectable model in Settings — most flexible, but you own the compatibility matrix for responseSchema support.

**B3. How to repair the Planner sync gap.** Wiring the 21 functions is mechanical; what isn't is that existing local plans were never uploaded and **will be destroyed by the next initializeSync.**
- *Fix forward only.* Ship the sync calls; anyone with an unsynced plan loses it on next login.
- *One-shot migration.* On first load after the update, if local planner tables are non-empty, force-push via the existing syncAllToCloud path (`dataSyncService.js:602-643` already collects all seven) before allowing any download. ~30 lines in migrationService — but note migrations don't auto-run, so this must be wired into App.jsx.
- *Harden the guard instead.* Change initializeSync's pending check (`:662`) from "syncQueue is empty" to "syncQueue is empty AND every synced table's local row count matches the cloud's". Catches this class permanently, not just the planner — but it's a bigger change to the riskiest function in the codebase.

**B4. How opinionated should the prose analyser be?** WEAK_ADVERBS (`proseAnalysisService.js:20-30`) includes `just`, `only`, `even`, `still`, `almost`, `nearly`, `mostly` — ordinary function words in competent prose. Flagging them keeps `health` pinned at "needs-work" (thresholds `:506-513`) for good writing, **which trains the user to ignore the panel entirely.** (a) trim to classic -ly manner adverbs plus very/really; (b) a strictness setting (Light/Standard/Ruthless) with per-category toggles; (c) weight instead of filter — only surface items above a confidence threshold (e.g. -ly adverb adjacent to a weak verb, already computed at `:213`), rest behind "show all". A taste call about your own voice.

**B5. Should the Story Planner be a modal or a route?** Today it's StoryPlannerModal mounted from two places (`WritingStudio.jsx:619`, `WritingEditor.jsx:769`), with only `/writing` and `/writing/:id` registered (`App.jsx:398-399`). Every sub-view is reached by dashboard card click and left by a back arrow, so Plot Threads -> Character Arcs is dashboard-and-back, and **nothing in the planner is bookmarkable, linkable, or survives a refresh.**
(a) keep the modal, add a tab bar — smallest change, fixes the two-click round trip, still not linkable; (b) promote to routes `/writing/:id/plan/:view` — deep links, browser back, the AI can be pointed at a specific view; requires reworking the modal shell into a layout route; (c) fold the planner into the editor's right rail as a fifth panel mode — best for the actual writing loop (see beats while drafting) but 380px is too narrow for TimelineView and BeatSheetView.
Determines whether the Part A refactor is a component extraction or a routing change.

## Redesign opportunities

### Writing Studio

**What it is today.** `/writing` is a card grid: three stat tiles, a search box, three filter selects, Framer cards. The editor is a fixed three-column flex row (`WritingEditor.css:136-145, 377`): 240px chapter list (shown only when `chapters.length > 1 || type is novel/novella`), a centre column with a 15-button toolbar above a TipTap surface capped at 720px with line-height 1.8, and a 380px right rail. **The rail is a single-slot, mutually-exclusive switch between five panels** — Reference Browser, Planning Sidebar, Writing Wizard, Canon Check, and (default) Entity Sidebar — driven by four header toggles that each close the other three (`WritingEditor.jsx:614-675`). Below 1200px the entire rail display:none's; below 768px the chapter list and all header buttons vanish too.

**The core problem: five tools competing for one slot.** The whole premise is that world data and prose live together. But you can't have the Reference Browser open while checking your beat sheet, and you can't see canon issues while reading the entity list. Every switch is a full context swap, and the tools don't talk to each other — a canon issue saying "this person no longer exists" has no button to open that person in the Reference Browser. **It should be a dockable rail with two stacked slots and a tab strip** — or at minimum let Reference and Planner coexist (the two you actually use *while* writing) with Canon and Wizard as review-mode panels. Persist which panels are open per writing.

In rough order of what a novelist will miss first:
1. **Nothing you type is findable.** No search across the manuscript — not within a chapter, not across chapters. Cmd+F gives you the browser's view of the visible chapter only. Table stakes; a scroll-to-match over `contentPlainText` (already stored on every chapter, `chapterService.js:61`) across getChaptersByWriting is a weekend's work and the highest-value addition in the subsystem.
2. **No word-count goal.** `targetWordCount` exists on the writing record (`writingService.js:68`) and on beats (`:473`) and is **never rendered anywhere**. The header shows a bare `12,481 words` (`WritingEditor.jsx:586`). Add a progress ring, a session counter, a daily goal — the single most motivating feature in every competing tool, and the data model already supports it.
3. **No revision history.** Autosave overwrites `chapters.content` in place and cloud conflict resolution is last-write-wins. There is no way to recover yesterday's version of a paragraph you deleted. A `chapterRevisions` table snapshotting every N minutes or M words, with a diff view, **converts the local-first architecture from a liability into a feature.**
4. **No focus/typewriter mode.** The 720px column and 1.8 line-height are already good prose typography — but there's no way to hide the chrome. A focus toggle collapsing both sidebars and the header, dimming non-current paragraphs, keeping the caret vertically centred: ~40 lines of CSS plus one state flag.
5. **No split view.** Chapters are strictly one-at-a-time. Writing ch12 while re-reading ch3 requires switching back and forth — which currently risks overwriting one with the other.
6. **Chapter management is impoverished.** You can add and delete; you cannot rename (title is display-only at `:82`), reorder (`reorderChapters`/`moveChapter` exist at `chapterService.js:222, 238` with zero callers), or set per-chapter status/POV (`status` and `povCharacter` persisted at `:63, 65`, never surfaced). Drag-to-reorder plus inline rename in the existing rail is low-effort, high-payoff.
7. **The mobile story is "no".** Below 768px you lose the chapter list, every header button, and the entire tool rail. Either commit to a real mobile layout (bottom sheet for tools) or explicitly gate the route rather than silently deleting the UI.
8. **Wiki-links are half-wired.** Clicking a person or house link does `console.log` (`WritingEditor.jsx:375, 379`) — nothing happens. Codex and dignity navigate away from the editor entirely (`:382, 385`), losing your place. **Both should open a hover card / peek panel in the rail, not a navigation. That's the interaction that makes the world-data integration feel like a superpower instead of a filing cabinet.**

**Story Planner surface.** Six views behind a card grid, visually cohesive but interaction-incoherent: PlotThreads and StoryArcs edit in a popup modal, CharacterArcs edits in-place, BeatSheet cycles status on click with no dropdown. Setup/Payoff scene pickers are asymmetric (chip-with-x when set, bare select when unset). **TimelineView is genuinely the best thing in the subsystem** (zoomable, drag scenes to snap-link to beats within 10%, SVG tension curve, per-arc lanes) and is the only drag surface, which makes the up/down chevrons in StoryArcsView (`:404-419`) feel archaic. Pick one edit paradigm — in-place detail editing everywhere, modals only for creation — and one reorder paradigm (drag).

**The planner's real missed opportunity is bidirectional linkage with the prose.** PlanningSidebar is the right idea in the right place (beat context, scene goal/conflict/disaster, active threads, three AI quick-actions, all while you draft) but it's read-only. There's no "mark this beat complete from the editor", no "this chapter fulfils beat X" picker (`storyBeats.actualChapterId` exists at `planningService.js:438` and **nothing sets it**), no word count rolling up from chapters into beat progress. Wire those three and the planner stops being a separate app.

### AI

**What it is today.** Two disconnected surfaces: a global chat overlay (reachable from the nav on every page) with five Analyze buttons, four Create buttons that just prefill the input, a Full Context checkbox, and an approve/reject proposal list; and, scattered through the Writing Studio, **eleven one-shot prompt buttons** — Craft Coach, AI Canon Check, nine planner suggestions — each with its own spinner, its own alert()-based error handling, and no shared state.

**Everything blocks.** Every call is `generateContent`, never `streamGenerateContent`. askGeminiWithFullContext uses maxOutputTokens 4096 (`:276`) preceded by a ~40k-token upload, so the user watches an animated "Contemplating" ellipsis for 15-30 seconds with no cancel and no partial output. For a chat interface that's the difference between usable and abandoned. **Switching to streamGenerateContent with an AbortController is the single highest-impact AI change available**, and it also gives you the cancel button that's currently impossible.

**The proposal system is the best-designed thing here and it doesn't run.** `aiProposalService.js` has real per-entity-type validation, cascade-impact warnings ("deleting this person will also delete 3 relationships", `:391`), severity grading, and a `generateProposalDiff` producing field-level before/after (`:468`). AIProposalCard renders before/after summaries with severity badges. aiProposalExecutor captures rollback data. **None of it is reachable**: the executor is called with the wrong context shape, enrichProposal is bypassed by a duplicate parser, generateProposalDiff has no caller, executeRollback has no caller. Fixing the call site is a one-hour job that switches on an entire well-built feature. Then: show the real diff (not the AI's self-reported preview.afterSummary), and put an Undo button on every executed card backed by the rollback stack already being captured.

Where AI belongs in a writing tool, and where it currently isn't:
- **Inline, selection-scoped.** The Craft Coach analyses `plainText.slice(0, 3000)` of the whole chapter (`WritingEditor.jsx:492`) and returns a seven-heading essay. What a novelist wants: select a paragraph, hit a key, get three tightened alternatives inline with accept/reject — **the same approve/reject affordance the proposal system already implements for data. Reuse it for prose.**
- **Canon check should be ambient, not a button.** The rule-based checks are fast and local; run them on a debounce and underline the offending span with TipTap decorations, the way spellcheck works. Reserve the AI check for an explicit deep-review pass. Right now issues appear in a panel with no connection to the text — IssueCard has entityId and displayText but no way to jump to the occurrence — and dismissals aren't persisted (`WritingEditor.jsx:475` just filters state), so every re-run resurfaces everything you already judged.
- **One AI surface, not twelve.** Eleven scattered buttons each duplicate the loading/error/result pattern. A single `useAIRequest(fn)` hook returning `{run, cancel, loading, result, error}` plus one shared result renderer would delete several hundred lines and make streaming, retry and cancellation a one-place change.
- **Cost telemetry.** No accounting anywhere. Given a client-side key and a 40k-token payload per chat turn, the app should at minimum log estimated tokens per call and show a session total. **`usageMetadata` comes back in every Gemini response and is currently discarded** (`aiAssistantService.js:375`).

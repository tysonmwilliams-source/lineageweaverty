/**
 * WritingEditor.jsx - Writing Editor Page
 *
 * Full editor page for writing projects with TipTap integration,
 * chapter navigation, and entity sidebar.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import Icon from '../components/icons';
import { useAuth } from '../contexts/AuthContext';
import { useDataset } from '../contexts/DatasetContext';
import { TipTapEditor, EditorToolbar } from '../components/writing/Editor';
import useAutoSave from '../hooks/useAutoSave';
import {
  getWriting,
  updateWriting,
  WRITING_STATUS_LABELS
} from '../services/writingService';
import {
  getChaptersByWriting,
  createChapter,
  updateChapter,
  deleteChapter,
  getChapter,
  moveChapter
} from '../services/chapterService';
import {
  syncUpdateWriting,
  syncAddChapter,
  syncUpdateChapter,
  syncDeleteChapter
} from '../services/dataSyncService';
import {
  syncChapterLinks,
  extractWikiLinksFromContent
} from '../services/writingLinkService';
import { EntitySidebar } from '../components/writing/Sidebar';
import { CanonCheckPanel } from '../components/writing/CanonCheck';
import WritingWizard from '../components/writing/WritingWizard';
import ReferenceBrowser from '../components/writing/ReferenceBrowser';
import { PlanningSidebar, StoryPlannerModal } from '../components/writing/Planner';
import ExportModal from '../components/writing/ExportModal';
import { runRuleBasedChecks, runAICanonCheck } from '../services/canonCheckService';
import { askGemini } from '../services/aiAssistantService';
import useDebouncedValue from '../hooks/useDebouncedValue';
import './WritingEditor.css';
import { logger } from '../utils/logger';

/**
 * ChapterSidebar Component
 */
function ChapterSidebar({
  chapters,
  activeChapterId,
  onSelectChapter,
  onAddChapter,
  onDeleteChapter,
  onRenameChapter,
  onMoveChapter,
  isMultiChapter
}) {
  // Which chapter is being renamed inline, and the draft title.
  const [renamingId, setRenamingId] = useState(null);
  const [draftTitle, setDraftTitle] = useState('');

  if (!isMultiChapter) return null;

  const beginRename = (chapter) => {
    setRenamingId(chapter.id);
    setDraftTitle(chapter.title || '');
  };

  const commitRename = () => {
    if (renamingId === null) return;
    const trimmed = draftTitle.trim();
    const original = chapters.find(c => c.id === renamingId);
    // An empty title is meaningful — the list falls back to "Chapter N" — but
    // don't write a no-op update.
    if (original && trimmed !== (original.title || '')) {
      onRenameChapter(renamingId, trimmed);
    }
    setRenamingId(null);
    setDraftTitle('');
  };

  return (
    <div className="chapter-sidebar">
      <div className="chapter-sidebar__header">
        <h3>Chapters</h3>
        <button
          className="chapter-sidebar__add-btn"
          onClick={onAddChapter}
          title="Add Chapter"
        >
          <Icon name="plus" size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="chapter-sidebar__list">
        {chapters.map((chapter, index) => (
          <div
            key={chapter.id}
            className={`chapter-sidebar__item ${activeChapterId === chapter.id ? 'chapter-sidebar__item--active' : ''}`}
            onClick={() => {
              if (renamingId !== chapter.id) onSelectChapter(chapter.id);
            }}
          >
            <div className="chapter-sidebar__item-main">
              {renamingId === chapter.id ? (
                <input
                  className="chapter-sidebar__item-rename"
                  value={draftTitle}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') { setRenamingId(null); setDraftTitle(''); }
                  }}
                  placeholder={`Chapter ${chapter.order}`}
                  aria-label="Chapter title"
                />
              ) : (
                <span
                  className="chapter-sidebar__item-title"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    beginRename(chapter);
                  }}
                  title="Double-click to rename"
                >
                  {chapter.title || `Chapter ${chapter.order}`}
                </span>
              )}

              {/* status and POV are persisted per chapter and were never shown */}
              <span className="chapter-sidebar__item-meta">
                {chapter.status && (
                  <span className={`chapter-sidebar__status chapter-sidebar__status--${chapter.status}`}>
                    {chapter.status}
                  </span>
                )}
                {chapter.povCharacter && (
                  <span className="chapter-sidebar__pov" title="POV character">
                    <Icon name="user" size={11} strokeWidth={2} /> {chapter.povCharacter}
                  </span>
                )}
                <span className="chapter-sidebar__item-words">
                  {chapter.wordCount?.toLocaleString() || 0} words
                </span>
              </span>
            </div>

            <div className="chapter-sidebar__item-controls" onClick={(e) => e.stopPropagation()}>
              <button
                className="chapter-sidebar__item-btn"
                onClick={() => onMoveChapter(chapter.id, chapter.order - 1)}
                disabled={index === 0}
                title="Move up"
                aria-label={`Move ${chapter.title || `Chapter ${chapter.order}`} up`}
              >
                <Icon name="chevron-up" size={14} strokeWidth={2} />
              </button>
              <button
                className="chapter-sidebar__item-btn"
                onClick={() => onMoveChapter(chapter.id, chapter.order + 1)}
                disabled={index === chapters.length - 1}
                title="Move down"
                aria-label={`Move ${chapter.title || `Chapter ${chapter.order}`} down`}
              >
                <Icon name="chevron-down" size={14} strokeWidth={2} />
              </button>
              <button
                className="chapter-sidebar__item-btn"
                onClick={() => beginRename(chapter)}
                title="Rename chapter"
                aria-label={`Rename ${chapter.title || `Chapter ${chapter.order}`}`}
              >
                <Icon name="pencil" size={14} strokeWidth={2} />
              </button>
              {chapters.length > 1 && (
                <button
                  className="chapter-sidebar__item-delete"
                  onClick={() => onDeleteChapter(chapter.id)}
                  title="Delete Chapter"
                >
                  <Icon name="x" size={14} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


/**
 * Main WritingEditor Component
 */
export default function WritingEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeDataset } = useDataset();

  const editorRef = useRef(null);
  // Total word count when this editor was opened, for the session counter. A ref,
  // not state: it must not trigger a re-render and must not reset on chapter switch.
  const sessionBaselineRef = useRef(null);
  const [editor, setEditor] = useState(null);
  const [writing, setWriting] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [activeChapterId, setActiveChapterId] = useState(null);
  const [activeChapter, setActiveChapter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingSaveData, setPendingSaveData] = useState(null);

  // Canon check state
  const [showCanonPanel, setShowCanonPanel] = useState(false);
  const [canonIssues, setCanonIssues] = useState([]);
  const [isCheckingCanon, setIsCheckingCanon] = useState(false);
  const [canonCheckType, setCanonCheckType] = useState(null); // 'quick' or 'ai'
  const [lastCanonCheck, setLastCanonCheck] = useState(null);

  // Writing Wizard state
  const [showWizardPanel, setShowWizardPanel] = useState(false);
  const [isAIAnalyzing, setIsAIAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState(null);

  // Reference Browser state
  const [showReferenceBrowser, setShowReferenceBrowser] = useState(false);

  // Planning Sidebar state
  const [showPlannerPanel, setShowPlannerPanel] = useState(false);

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);

  // Planner modal state
  const [showPlannerModal, setShowPlannerModal] = useState(false);

  // Mobile drawer state (decision C1).
  //
  // Below 768px the chapter list used to be `display: none` with nothing in its
  // place, so on a phone the chapter list was simply unreachable — you could open
  // a novel and have no way to move between its chapters. Same for the entity
  // sidebar below 1200px. Both are now drawers with an explicit toggle.
  const [mobileDrawer, setMobileDrawer] = useState(null); // 'chapters' | 'entities' | null

  // Is this a multi-chapter writing?
  const isMultiChapter = chapters.length > 1 ||
    writing?.type === 'novel' ||
    writing?.type === 'novella';

  // Save chapter content
  const saveChapterContent = useCallback(async (data) => {
    // Write to the chapter the content was captured from, NOT the currently
    // selected one — a debounced save can land after the user switched away.
    const targetChapterId = data?.chapterId;
    if (!targetChapterId || !data) return;

    const datasetId = activeDataset?.id;
    const writingId = parseInt(id);

    const contentFields = {
      content: data.json,
      contentHtml: data.html,
      contentPlainText: data.text,
      wordCount: data.wordCount
    };

    await updateChapter(targetChapterId, contentFields, datasetId);

    // Extract and sync wiki-links
    const wikiLinks = extractWikiLinksFromContent(data.json);
    await syncChapterLinks(targetChapterId, writingId, wikiLinks, datasetId, user?.uid);

    // Sync to cloud
    if (user && activeDataset) {
      syncUpdateChapter(user.uid, datasetId, targetChapterId, contentFields);
    }

    // Update local state - ONLY update wordCount, not content
    // The editor already has the content, and updating content in state
    // triggers TipTapEditor's content sync effect, causing an infinite loop
    setActiveChapter(prev =>
      prev && prev.id === targetChapterId
        ? { ...prev, wordCount: data.wordCount }
        : prev
    );
    setChapters(prev => prev.map(ch =>
      ch.id === targetChapterId ? { ...ch, wordCount: data.wordCount } : ch
    ));
  }, [id, user, activeDataset]);

  // Text fed to the Writing Wizard's prose analysis.
  //
  // This was `editor?.getText()` read inline in the JSX, so it was recomputed
  // on every render — and WritingEditor re-renders on every keystroke via
  // setPendingSaveData. The full analysis (7 sentence splits plus thousands of
  // regex passes) therefore ran synchronously on each character typed.
  const debouncedPlainText = useDebouncedValue(
    pendingSaveData?.text ?? activeChapter?.contentPlainText ?? '',
    400
  );

  // Auto-save hook
  const { isSaving, lastSaved, saveNow, hasUnsavedChanges } = useAutoSave({
    data: pendingSaveData,
    onSave: saveChapterContent,
    delay: 1500,
    enabled: !!activeChapterId && !!pendingSaveData
  });

  // Load writing and chapters
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const datasetId = activeDataset?.id;

        const writingData = await getWriting(parseInt(id), datasetId);
        if (!writingData) {
          navigate('/writing');
          return;
        }
        setWriting(writingData);

        let chaptersData = await getChaptersByWriting(parseInt(id), datasetId);

        // If no chapters exist (e.g., from cloud sync without chapter), create one
        if (chaptersData.length === 0) {
          logger.log('No chapters found, creating default chapter...');
          const chapterId = await createChapter({
            writingId: parseInt(id),
            title: 'Chapter 1',
            order: 1
          }, datasetId);

          // Sync to cloud
          if (user && activeDataset) {
            const newChapter = await getChapter(chapterId, datasetId);
            syncAddChapter(user.uid, datasetId, chapterId, newChapter);
          }

          chaptersData = await getChaptersByWriting(parseInt(id), datasetId);
        }

        setChapters(chaptersData);

        // Capture the session baseline once, on the initial load only, so the
        // "this session" counter measures from when the editor was opened.
        if (sessionBaselineRef.current === null) {
          sessionBaselineRef.current = chaptersData.reduce(
            (sum, ch) => sum + (ch.wordCount || 0),
            0
          );
        }

        // Select first chapter by default
        if (chaptersData.length > 0) {
          setActiveChapterId(chaptersData[0].id);
          setActiveChapter(chaptersData[0]);
        }
      } catch (error) {
        logger.error('Failed to load writing:', error);
        navigate('/writing');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id, activeDataset?.id, navigate]);

  // Load active chapter when selection changes
  useEffect(() => {
    async function loadChapter() {
      if (!activeChapterId) return;
      const chapter = await getChapter(activeChapterId, activeDataset?.id);
      setActiveChapter(chapter);
    }
    loadChapter();
  }, [activeChapterId, activeDataset?.id]);

  // Handle chapter selection
  const handleSelectChapter = useCallback(async (chapterId) => {
    if (chapterId === activeChapterId) return;
    // Flush any pending edit to the outgoing chapter before switching, so the
    // debounce window can never straddle a chapter change.
    if (pendingSaveData) {
      await saveNow();
      setPendingSaveData(null);
    }
    setActiveChapterId(chapterId);
  }, [activeChapterId, pendingSaveData, saveNow]);

  // Handle adding a new chapter
  const handleAddChapter = useCallback(async () => {
    const datasetId = activeDataset?.id;
    const newOrder = chapters.length + 1;

    const chapterId = await createChapter({
      writingId: parseInt(id),
      title: `Chapter ${newOrder}`,
      order: newOrder
    }, datasetId);

    // Sync to cloud
    if (user && activeDataset) {
      const newChapterData = await getChapter(chapterId, datasetId);
      syncAddChapter(user.uid, datasetId, chapterId, newChapterData);
    }

    // Reload chapters
    const updatedChapters = await getChaptersByWriting(parseInt(id), datasetId);
    setChapters(updatedChapters);
    setActiveChapterId(chapterId);
  }, [id, chapters.length, user, activeDataset]);

  // Handle deleting a chapter
  const handleDeleteChapter = useCallback(async (chapterId) => {
    if (chapters.length <= 1) return; // Can't delete last chapter

    const datasetId = activeDataset?.id;
    await deleteChapter(chapterId, datasetId);

    // Sync to cloud
    if (user && activeDataset) {
      syncDeleteChapter(user.uid, datasetId, chapterId);
    }

    // Reload chapters
    const updatedChapters = await getChaptersByWriting(parseInt(id), datasetId);
    setChapters(updatedChapters);

    // Select first chapter if deleted was active
    if (activeChapterId === chapterId && updatedChapters.length > 0) {
      setActiveChapterId(updatedChapters[0].id);
    }
  }, [id, chapters.length, activeChapterId, user, activeDataset]);

  // Rename a chapter inline. The title was editable in the data model and in
  // the cloud schema, but there was no way to change it after creation.
  const handleRenameChapter = useCallback(async (chapterId, newTitle) => {
    const datasetId = activeDataset?.id;

    await updateChapter(chapterId, { title: newTitle }, datasetId);

    if (user && activeDataset) {
      syncUpdateChapter(user.uid, datasetId, chapterId, { title: newTitle });
    }

    setChapters(prev => prev.map(c => (c.id === chapterId ? { ...c, title: newTitle } : c)));
  }, [user, activeDataset]);

  // Move a chapter up or down. moveChapter handles renumbering the chapters it
  // displaces and syncs each changed row.
  const handleMoveChapter = useCallback(async (chapterId, newOrder) => {
    if (newOrder < 1 || newOrder > chapters.length) return;

    const datasetId = activeDataset?.id;
    await moveChapter(chapterId, newOrder, datasetId, user?.uid || null);

    // Re-read rather than reordering locally: moveChapter renumbers several rows
    // and the sorted result is the source of truth.
    const updatedChapters = await getChaptersByWriting(parseInt(id), datasetId);
    setChapters(updatedChapters);
  }, [id, chapters.length, user, activeDataset]);

  // Handle editor content change - sets data for auto-save
  const handleEditorUpdate = useCallback(({ editor: editorInstance }) => {
    if (!editorInstance || !activeChapterId) return;

    const json = editorInstance.getJSON();
    const html = editorInstance.getHTML();
    const text = editorInstance.getText();
    const wordCount = editorInstance.storage.characterCount?.words() || 0;

    // Stamp the chapter this content belongs to. The debounced save may resolve
    // after the user has already switched chapters, so the payload must carry
    // its own target rather than relying on whatever activeChapterId is by then.
    setPendingSaveData({ chapterId: activeChapterId, json, html, text, wordCount });
  }, [activeChapterId]);

  // Handle wiki-link insertion - triggers the autocomplete
  const handleInsertWikiLink = useCallback(() => {
    if (!editor) return;
    // Insert the trigger characters to start autocomplete
    editor.chain().focus().insertContent('[[').run();
  }, [editor]);

  // Handle entity insertion from Reference Browser
  const handleInsertEntityFromBrowser = useCallback((entity) => {
    // Get fresh editor reference from the ref
    const currentEditor = editorRef.current?.getEditor?.();

    if (!currentEditor) {
      logger.warn('Editor not available from ref');
      return;
    }

    if (currentEditor.isDestroyed) {
      logger.warn('Editor is destroyed');
      return;
    }

    try {
      // Focus at end and insert the wiki-link
      currentEditor
        .chain()
        .focus('end')
        .insertContent([
          {
            type: 'wikiLink',
            attrs: {
              id: entity.id,
              type: entity.type,
              label: entity.label
            }
          },
          { type: 'text', text: ' ' }
        ])
        .run();
    } catch (error) {
      logger.error('Failed to insert entity:', error);
    }
  }, []);

  // Handle wiki-link click - navigate to the entity
  const handleWikiLinkClick = useCallback(({ id, type }) => {
    // Navigate to the appropriate entity view
    switch (type) {
      case 'person':
        // People don't have individual view pages yet, could open in sidebar
        logger.log('Wiki-link clicked: person', id);
        break;
      case 'house':
        // Houses don't have individual view pages yet
        logger.log('Wiki-link clicked: house', id);
        break;
      case 'codex':
        navigate(`/codex/entry/${id}`);
        break;
      case 'dignity':
        navigate(`/dignities/view/${id}`);
        break;
      default:
        logger.log('Wiki-link clicked:', type, id);
    }
  }, [navigate]);

  // Handle quick (rule-based) canon check
  const handleQuickCanonCheck = useCallback(async () => {
    if (!editor || !activeChapter) return;

    setIsCheckingCanon(true);
    setCanonCheckType('quick');
    setShowCanonPanel(true);

    try {
      const content = editor.getJSON();
      const plainText = editor.getText();

      const issues = await runRuleBasedChecks(
        parseInt(id),
        content,
        plainText,
        activeDataset?.id
      );

      setCanonIssues(issues);
      setLastCanonCheck(new Date());
    } catch (error) {
      logger.error('Canon check failed:', error);
      setCanonIssues([{
        id: 'error-check',
        type: 'warning',
        title: 'Check Failed',
        description: 'Could not complete canon check. Please try again.',
        details: error.message
      }]);
    } finally {
      setIsCheckingCanon(false);
      setCanonCheckType(null);
    }
  }, [id, editor, activeChapter, activeDataset?.id]);

  // Handle AI-powered canon check
  const handleAICanonCheck = useCallback(async () => {
    if (!editor || !activeChapter) return;

    setIsCheckingCanon(true);
    setCanonCheckType('ai');
    setShowCanonPanel(true);

    try {
      const content = editor.getJSON();
      const plainText = editor.getText();

      // Run quick checks first, then AI
      const quickIssues = await runRuleBasedChecks(
        parseInt(id),
        content,
        plainText,
        activeDataset?.id
      );

      const aiIssues = await runAICanonCheck(
        parseInt(id),
        content,
        plainText,
        activeDataset?.id
      );

      // Combine issues (quick first, then AI)
      const allIssues = [...quickIssues, ...aiIssues];
      setCanonIssues(allIssues);
      setLastCanonCheck(new Date());
    } catch (error) {
      logger.error('AI Canon check failed:', error);
      setCanonIssues([{
        id: 'error-ai-check',
        type: 'warning',
        title: 'AI Check Failed',
        description: 'Could not complete AI canon check. Please try again.',
        details: error.message
      }]);
    } finally {
      setIsCheckingCanon(false);
      setCanonCheckType(null);
    }
  }, [id, editor, activeChapter, activeDataset?.id]);

  // Handle dismissing a canon issue
  const handleDismissCanonIssue = useCallback((issueId) => {
    setCanonIssues(prev => prev.filter(i => i.id !== issueId));
  }, []);

  // Handle AI Craft Coach analysis
  const handleRunAIAnalysis = useCallback(async () => {
    if (!editor) return;

    setIsAIAnalyzing(true);

    try {
      const plainText = editor.getText();

      const prompt = `You are an expert fiction writing coach, trained in the methods of Stephen King, Donald Maass, and Ursula K. Le Guin. Analyze this prose excerpt and provide constructive feedback.

EXCERPT TO ANALYZE:
"""
${plainText.slice(0, 3000)}
"""

Provide feedback in these categories:

1. **Emotional Resonance**: Does the writing evoke emotion? Are we feeling WITH the characters or being told about their feelings?

2. **Tension & Conflict**: Is there micro-tension that keeps readers engaged? What's at stake in this passage?

3. **Show vs Tell Balance**: Identify any places where emotions or situations are told rather than shown.

4. **Pacing**: How does the rhythm feel? Are there places that drag or rush?

5. **Voice & Style**: Is there a distinctive voice? Does the prose have energy?

6. **Strongest Element**: What's working well that the writer should keep doing?

7. **Top Priority Fix**: If the writer could only change ONE thing, what would have the biggest impact?

Be encouraging but honest. Give specific examples from the text when possible. Keep feedback actionable.`;

      const response = await askGemini(prompt, {}, {
        temperature: 0.7,
        maxOutputTokens: 2048
      });

      setAiAnalysisResult(response);
    } catch (error) {
      logger.error('AI analysis failed:', error);
      setAiAnalysisResult('Analysis failed. Please try again.');
    } finally {
      setIsAIAnalyzing(false);
    }
  }, [editor]);

  // Handle writing status change
  const handleStatusChange = useCallback(async (newStatus) => {
    const datasetId = activeDataset?.id;

    await updateWriting(parseInt(id), { status: newStatus }, datasetId);

    // Sync to cloud
    if (user && activeDataset) {
      syncUpdateWriting(user.uid, datasetId, parseInt(id), { status: newStatus });
    }

    setWriting(prev => ({ ...prev, status: newStatus }));
  }, [id, user, activeDataset]);

  if (loading) {
    return (
      <>
        <Navigation />
        <div className="writing-editor__loading">
          <div className="loader-spinner" />
          <p>Loading...</p>
        </div>
      </>
    );
  }

  if (!writing) {
    return null;
  }

  // Calculate total word count
  const totalWordCount = chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);

  // targetWordCount has been persisted on every writing since writingService was
  // written and was never rendered anywhere — so a target you set was invisible.
  const targetWordCount = writing.targetWordCount || 0;
  const hasTarget = targetWordCount > 0;
  const progressRatio = hasTarget ? Math.min(totalWordCount / targetWordCount, 1) : 0;
  const progressPercent = Math.round(progressRatio * 100);

  // Words written since this editor was opened. Baseline is captured on load, so
  // it survives chapter switches but resets when you leave — which is what a
  // "this session" number should mean.
  const sessionWords = sessionBaselineRef.current === null
    ? 0
    : Math.max(0, totalWordCount - sessionBaselineRef.current);

  // A 36px ring, stroke 3.5, so r = (36 - 3.5) / 2
  const RING_RADIUS = 16.25;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  return (
    <>
      <Navigation compactMode />

      <div className="writing-editor">
        {/* Header */}
        <header className="writing-editor__header">
          <div className="writing-editor__header-left">
            <button
              className="writing-editor__back-btn"
              onClick={() => navigate('/writing')}
            >
              <Icon name="arrow-left" size={20} strokeWidth={2} />
            </button>
            {hasTarget && (
              <div
                className="writing-editor__progress"
                role="progressbar"
                aria-valuenow={progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${progressPercent}% of ${targetWordCount.toLocaleString()} word target`}
                title={`${totalWordCount.toLocaleString()} of ${targetWordCount.toLocaleString()} words`}
              >
                <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
                  <circle
                    className="writing-editor__progress-track"
                    cx="18" cy="18" r={RING_RADIUS}
                    fill="none" strokeWidth="3.5"
                  />
                  <circle
                    className="writing-editor__progress-fill"
                    cx="18" cy="18" r={RING_RADIUS}
                    fill="none" strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={RING_CIRCUMFERENCE * (1 - progressRatio)}
                    // Start the arc at 12 o'clock instead of 3 o'clock
                    transform="rotate(-90 18 18)"
                  />
                </svg>
                <span className="writing-editor__progress-label">{progressPercent}%</span>
              </div>
            )}
            <div className="writing-editor__title-section">
              <h1 className="writing-editor__title">{writing.title}</h1>
              <div className="writing-editor__meta">
                <select
                  className="writing-editor__status-select"
                  value={writing.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                >
                  {Object.entries(WRITING_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <span className="writing-editor__word-count">
                  {totalWordCount.toLocaleString()} words
                  {hasTarget && ` of ${targetWordCount.toLocaleString()}`}
                </span>
                {sessionWords > 0 && (
                  <span
                    className="writing-editor__session-count"
                    title="Words added since you opened this editor"
                  >
                    +{sessionWords.toLocaleString()} this session
                  </span>
                )}
                {hasUnsavedChanges && !isSaving && (
                  <span className="writing-editor__unsaved">Unsaved changes</span>
                )}
                {isSaving && (
                  <span className="writing-editor__saving">Saving...</span>
                )}
                {!isSaving && !hasUnsavedChanges && lastSaved && (
                  <span className="writing-editor__saved">
                    Saved {lastSaved.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="writing-editor__header-right">
            <button
              className="btn btn--secondary"
              title="Export"
              onClick={() => setShowExportModal(true)}
            >
              <Icon name="download" size={18} strokeWidth={2} />
              Export
            </button>
            <button
              className={`btn btn--secondary ${showReferenceBrowser ? 'btn--active' : ''}`}
              title="Reference Browser - Browse your world data"
              onClick={() => {
                setShowReferenceBrowser(!showReferenceBrowser);
                if (!showReferenceBrowser) {
                  setShowWizardPanel(false);
                  setShowCanonPanel(false);
                  setShowPlannerPanel(false);
                }
              }}
            >
              <Icon name="library" size={18} strokeWidth={2} />
              Reference
            </button>
            <button
              className={`btn btn--secondary ${showPlannerPanel ? 'btn--active' : ''}`}
              title="Story Planner - View planning context"
              onClick={() => {
                setShowPlannerPanel(!showPlannerPanel);
                if (!showPlannerPanel) {
                  setShowWizardPanel(false);
                  setShowCanonPanel(false);
                  setShowReferenceBrowser(false);
                }
              }}
            >
              <Icon name="map" size={18} strokeWidth={2} />
              Planner
            </button>
            {/* Narrow-viewport drawer toggles. Hidden by CSS above the
                breakpoint at which each panel is docked. */}
            {isMultiChapter && (
              <button
                className={`btn btn--secondary writing-editor__drawer-toggle writing-editor__drawer-toggle--chapters ${mobileDrawer === 'chapters' ? 'btn--active' : ''}`}
                title="Chapters"
                aria-expanded={mobileDrawer === 'chapters'}
                onClick={() => setMobileDrawer(mobileDrawer === 'chapters' ? null : 'chapters')}
              >
                <Icon name="list" size={18} strokeWidth={2} />
                Chapters
              </button>
            )}
            <button
              className={`btn btn--secondary writing-editor__drawer-toggle writing-editor__drawer-toggle--entities ${mobileDrawer === 'entities' ? 'btn--active' : ''}`}
              title="Reference panel"
              aria-expanded={mobileDrawer === 'entities'}
              onClick={() => setMobileDrawer(mobileDrawer === 'entities' ? null : 'entities')}
            >
              <Icon name="book-open" size={18} strokeWidth={2} />
              Reference
            </button>
            <button
              className={`btn btn--secondary ${showWizardPanel ? 'btn--active' : ''}`}
              title="Writing Wizard"
              onClick={() => {
                setShowWizardPanel(!showWizardPanel);
                if (!showWizardPanel) {
                  setShowCanonPanel(false);
                  setShowReferenceBrowser(false);
                  setShowPlannerPanel(false);
                }
              }}
            >
              <Icon name="sparkles" size={18} strokeWidth={2} />
              Wizard
            </button>
            <button
              className={`btn btn--secondary ${showCanonPanel ? 'btn--active' : ''}`}
              title="Canon Check"
              onClick={() => {
                setShowCanonPanel(!showCanonPanel);
                if (!showCanonPanel) {
                  setShowWizardPanel(false);
                  setShowReferenceBrowser(false);
                  setShowPlannerPanel(false);
                }
              }}
            >
              <Icon name="shield-check" size={18} strokeWidth={2} />
              Canon
              {canonIssues.filter(i => i.type === 'error' || i.type === 'warning').length > 0 && (
                <span className="btn__badge">{canonIssues.filter(i => i.type === 'error' || i.type === 'warning').length}</span>
              )}
            </button>
          </div>
        </header>

        {/* Main Content */}
        <div className="writing-editor__main">
          {/* Chapter Sidebar */}
          {mobileDrawer && (
            <button
              type="button"
              className="writing-editor__scrim"
              aria-label="Close panel"
              onClick={() => setMobileDrawer(null)}
            />
          )}

          <div
            className={`writing-editor__chapters-wrap ${mobileDrawer === 'chapters' ? 'writing-editor__chapters-wrap--open' : ''}`}
          >
          <ChapterSidebar
            chapters={chapters}
            activeChapterId={activeChapterId}
            onSelectChapter={handleSelectChapter}
            onAddChapter={handleAddChapter}
            onDeleteChapter={handleDeleteChapter}
            onRenameChapter={handleRenameChapter}
            onMoveChapter={handleMoveChapter}
            isMultiChapter={isMultiChapter}
          />
          </div>

          {/* Editor Area */}
          <div className="writing-editor__editor-area">
            <EditorToolbar
              editor={editor}
              onInsertWikiLink={handleInsertWikiLink}
            />

            {activeChapter && (
              <TipTapEditor
                ref={editorRef}
                content={activeChapter.content || ''}
                onUpdate={handleEditorUpdate}
                onEditorReady={setEditor}
                placeholder="Start writing your story..."
                editable={true}
                datasetId={activeDataset?.id}
                onWikiLinkClick={handleWikiLinkClick}
              />
            )}
          </div>

          {/* Right Sidebar - Entity, Canon Panel, Writing Wizard, Reference Browser, or Planner */}
          <div
            className={`writing-editor__entity-sidebar ${mobileDrawer === 'entities' ? 'writing-editor__entity-sidebar--open' : ''}`}
          >
            {showReferenceBrowser ? (
              <ReferenceBrowser
                datasetId={activeDataset?.id}
                onInsertEntity={handleInsertEntityFromBrowser}
                onClose={() => setShowReferenceBrowser(false)}
              />
            ) : showPlannerPanel ? (
              <PlanningSidebar
                writingId={parseInt(id)}
                chapterId={activeChapterId}
                onOpenPlanner={() => setShowPlannerModal(true)}
                onCreatePlan={() => setShowPlannerModal(true)}
              />
            ) : showWizardPanel ? (
              <WritingWizard
                plainText={debouncedPlainText}
                isOpen={showWizardPanel}
                onClose={() => setShowWizardPanel(false)}
                onRunAIAnalysis={handleRunAIAnalysis}
                isAIAnalyzing={isAIAnalyzing}
                aiAnalysisResult={aiAnalysisResult}
              />
            ) : showCanonPanel ? (
              <CanonCheckPanel
                issues={canonIssues}
                isChecking={isCheckingCanon}
                checkType={canonCheckType}
                onRunQuickCheck={handleQuickCanonCheck}
                onRunAICheck={handleAICanonCheck}
                onDismissIssue={handleDismissCanonIssue}
                onClose={() => setShowCanonPanel(false)}
                lastChecked={lastCanonCheck}
              />
            ) : (
              <EntitySidebar
                writingId={parseInt(id)}
                datasetId={activeDataset?.id}
                onEntityClick={handleWikiLinkClick}
                onInsertEntity={handleInsertWikiLink}
              />
            )}
          </div>
        </div>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        writingId={parseInt(id)}
        writingTitle={writing.title}
        datasetId={activeDataset?.id}
      />

      {/* Story Planner Modal */}
      <StoryPlannerModal
        isOpen={showPlannerModal}
        onClose={() => setShowPlannerModal(false)}
        writingId={parseInt(id)}
        writingTitle={writing.title}
        datasetId={activeDataset?.id}
      />
    </>
  );
}

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
  getChapter
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

/**
 * ChapterSidebar Component
 */
function ChapterSidebar({
  chapters,
  activeChapterId,
  onSelectChapter,
  onAddChapter,
  onDeleteChapter,
  isMultiChapter
}) {
  if (!isMultiChapter) return null;

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
        {chapters.map((chapter) => (
          <div
            key={chapter.id}
            className={`chapter-sidebar__item ${activeChapterId === chapter.id ? 'chapter-sidebar__item--active' : ''}`}
            onClick={() => onSelectChapter(chapter.id)}
          >
            <span className="chapter-sidebar__item-title">
              {chapter.title || `Chapter ${chapter.order}`}
            </span>
            <span className="chapter-sidebar__item-words">
              {chapter.wordCount?.toLocaleString() || 0}
            </span>
            {chapters.length > 1 && (
              <button
                className="chapter-sidebar__item-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteChapter(chapter.id);
                }}
                title="Delete Chapter"
              >
                <Icon name="x" size={14} strokeWidth={2} />
              </button>
            )}
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
          console.log('No chapters found, creating default chapter...');
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

        // Select first chapter by default
        if (chaptersData.length > 0) {
          setActiveChapterId(chaptersData[0].id);
          setActiveChapter(chaptersData[0]);
        }
      } catch (error) {
        console.error('Failed to load writing:', error);
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
      console.warn('Editor not available from ref');
      return;
    }

    if (currentEditor.isDestroyed) {
      console.warn('Editor is destroyed');
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
      console.error('Failed to insert entity:', error);
    }
  }, []);

  // Handle wiki-link click - navigate to the entity
  const handleWikiLinkClick = useCallback(({ id, type }) => {
    // Navigate to the appropriate entity view
    switch (type) {
      case 'person':
        // People don't have individual view pages yet, could open in sidebar
        console.log('Wiki-link clicked: person', id);
        break;
      case 'house':
        // Houses don't have individual view pages yet
        console.log('Wiki-link clicked: house', id);
        break;
      case 'codex':
        navigate(`/codex/entry/${id}`);
        break;
      case 'dignity':
        navigate(`/dignities/view/${id}`);
        break;
      default:
        console.log('Wiki-link clicked:', type, id);
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
      console.error('Canon check failed:', error);
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
      console.error('AI Canon check failed:', error);
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
      console.error('AI analysis failed:', error);
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
                </span>
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
          <ChapterSidebar
            chapters={chapters}
            activeChapterId={activeChapterId}
            onSelectChapter={handleSelectChapter}
            onAddChapter={handleAddChapter}
            onDeleteChapter={handleDeleteChapter}
            isMultiChapter={isMultiChapter}
          />

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
          <div className="writing-editor__entity-sidebar">
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

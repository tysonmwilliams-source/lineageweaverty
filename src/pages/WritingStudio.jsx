/**
 * WritingStudio.jsx - Writing Studio Landing Page
 *
 * Displays a list of all writing projects with create, edit, and delete capabilities.
 * Entry point for the canon-aware creative writing system.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navigation from '../components/Navigation';
import Icon from '../components/icons';
import { useAuth } from '../contexts/AuthContext';
import { useDataset } from '../contexts/DatasetContext';
import {
  getAllWritings,
  createWriting,
  deleteWriting,
  WRITING_TYPES,
  WRITING_STATUSES,
  WRITING_TYPE_LABELS,
  WRITING_STATUS_LABELS
} from '../services/writingService';
import { getChaptersByWriting } from '../services/chapterService';
import {
  syncAddWriting,
  syncDeleteWriting
} from '../services/dataSyncService';
import './WritingStudio.css';
import { logger } from '../utils/logger';

// Animation variants
const CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

const MODAL_VARIANTS = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.2 } }
};

/**
 * WritingCard Component
 */
function WritingCard({ writing, onOpen, onDelete, onOpenPlanner }) {
  const [chapterCount, setChapterCount] = useState(0);
  const { activeDataset } = useDataset();

  useEffect(() => {
    async function loadChapterCount() {
      const chapters = await getChaptersByWriting(writing.id, activeDataset?.id);
      setChapterCount(chapters.length);
    }
    loadChapterCount();
  }, [writing.id, activeDataset?.id]);

  const typeIcon = {
    [WRITING_TYPES.NOVEL]: 'book',
    [WRITING_TYPES.NOVELLA]: 'book-open',
    [WRITING_TYPES.SHORT_STORY]: 'file-text',
    [WRITING_TYPES.NOTES]: 'sticky-note'
  }[writing.type] || 'file-text';

  const statusColor = {
    [WRITING_STATUSES.DRAFT]: 'var(--text-tertiary)',
    [WRITING_STATUSES.IN_PROGRESS]: 'var(--color-info)',
    [WRITING_STATUSES.EDITING]: 'var(--color-warning)',
    [WRITING_STATUSES.COMPLETE]: 'var(--color-success)',
    [WRITING_STATUSES.ARCHIVED]: 'var(--text-tertiary)'
  }[writing.status] || 'var(--text-tertiary)';

  const formattedDate = new Date(writing.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <motion.div
      className="writing-card"
      variants={ITEM_VARIANTS}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      onClick={() => onOpen(writing.id)}
    >
      <div className="writing-card__header">
        <div className="writing-card__type-icon">
          <Icon name={typeIcon} size={24} strokeWidth={1.5} />
        </div>
        <div className="writing-card__actions">
          <button
            className="writing-card__action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPlanner(writing.id);
            }}
            title="Story Planner"
          >
            <Icon name="map" size={16} strokeWidth={2} />
          </button>
          <button
            className="writing-card__action-btn writing-card__action-btn--delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(writing);
            }}
            title="Delete"
          >
            <Icon name="trash-2" size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      <h3 className="writing-card__title">{writing.title}</h3>

      {writing.synopsis && (
        <p className="writing-card__synopsis">{writing.synopsis}</p>
      )}

      <div className="writing-card__meta">
        <span className="writing-card__type">
          {WRITING_TYPE_LABELS[writing.type]}
        </span>
        <span className="writing-card__status" style={{ color: statusColor }}>
          {WRITING_STATUS_LABELS[writing.status]}
        </span>
      </div>

      <div className="writing-card__stats">
        <span className="writing-card__stat">
          <Icon name="file-text" size={14} strokeWidth={1.5} />
          {chapterCount} {chapterCount === 1 ? 'chapter' : 'chapters'}
        </span>
        <span className="writing-card__stat">
          <Icon name="type" size={14} strokeWidth={1.5} />
          {writing.currentWordCount?.toLocaleString() || 0} words
        </span>
      </div>

      <div className="writing-card__footer">
        <span className="writing-card__date">Updated {formattedDate}</span>
        {writing.tags?.length > 0 && (
          <div className="writing-card__tags">
            {writing.tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="writing-card__tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * CreateWritingModal Component
 */
function CreateWritingModal({ isOpen, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState(WRITING_TYPES.SHORT_STORY);
  const [synopsis, setSynopsis] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;

    setCreating(true);
    try {
      await onCreate({ title: title.trim(), type, synopsis: synopsis.trim() });
      setTitle('');
      setType(WRITING_TYPES.SHORT_STORY);
      setSynopsis('');
      onClose();
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal-content"
        variants={MODAL_VARIANTS}
        initial="hidden"
        animate="visible"
        exit="hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>New Writing</h2>
          <button className="modal-close" onClick={onClose}>
            <Icon name="x" size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="writing-title">Title</label>
            <input
              id="writing-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title..."
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="writing-type">Type</label>
            <select
              id="writing-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {Object.entries(WRITING_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="writing-synopsis">Synopsis (optional)</label>
            <textarea
              id="writing-synopsis"
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="Brief description of your story..."
              rows={3}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={handleCreate}
            disabled={!title.trim() || creating}
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * DeleteConfirmModal Component
 */
function DeleteConfirmModal({ writing, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);

  if (!writing) return null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onConfirm(writing.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal-content modal-content--sm"
        variants={MODAL_VARIANTS}
        initial="hidden"
        animate="visible"
        exit="hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Delete Writing</h2>
          <button className="modal-close" onClick={onClose}>
            <Icon name="x" size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="modal-body">
          <p>
            Are you sure you want to delete <strong>"{writing.title}"</strong>?
            This will also delete all chapters and cannot be undone.
          </p>
        </div>

        <div className="modal-footer">
          <button className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Main WritingStudio Component
 */
export default function WritingStudio() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeDataset } = useDataset();

  const [writings, setWritings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [writingToDelete, setWritingToDelete] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('updated');

  // Load writings
  useEffect(() => {
    async function loadWritings() {
      try {
        setLoading(true);
        const data = await getAllWritings(activeDataset?.id);
        setWritings(data);
      } catch (error) {
        logger.error('Failed to load writings:', error);
      } finally {
        setLoading(false);
      }
    }
    loadWritings();
  }, [activeDataset?.id]);

  // Filter and sort writings
  const filteredWritings = useMemo(() => {
    let result = [...writings];

    // Search
    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      result = result.filter(w =>
        w.title.toLowerCase().includes(query) ||
        w.synopsis?.toLowerCase().includes(query) ||
        w.tags?.some(t => t.toLowerCase().includes(query))
      );
    }

    // Filter by type
    if (filterType !== 'all') {
      result = result.filter(w => w.type === filterType);
    }

    // Filter by status
    if (filterStatus !== 'all') {
      result = result.filter(w => w.status === filterStatus);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'created':
          return new Date(b.createdAt) - new Date(a.createdAt);
        case 'words':
          return (b.currentWordCount || 0) - (a.currentWordCount || 0);
        case 'updated':
        default:
          return new Date(b.updatedAt) - new Date(a.updatedAt);
      }
    });

    return result;
  }, [writings, searchTerm, filterType, filterStatus, sortBy]);

  // Handlers
  const handleCreate = useCallback(async (data) => {
    const datasetId = activeDataset?.id;
    const writingId = await createWriting(data, datasetId);
    const newWriting = await getAllWritings(datasetId);
    setWritings(newWriting);

    // Sync to cloud
    if (user && activeDataset) {
      syncAddWriting(user.uid, datasetId, writingId, data);
    }

    // Navigate to editor
    navigate(`/writing/${writingId}`);
  }, [user, activeDataset, navigate]);

  const handleDelete = useCallback(async (writingId) => {
    const datasetId = activeDataset?.id;
    const { chapterIds, linkIds } = await deleteWriting(writingId, datasetId);
    setWritings(prev => prev.filter(w => w.id !== writingId));

    // Sync to cloud, cascade included. Syncing only the writing left every
    // chapter and link of it in Firestore, and the next download restored them
    // as rows pointing at a writing that no longer exists.
    if (user && activeDataset) {
      syncDeleteWriting(user.uid, datasetId, writingId, { chapterIds, linkIds });
    }
  }, [user, activeDataset]);

  const handleOpen = useCallback((writingId) => {
    navigate(`/writing/${writingId}`);
  }, [navigate]);

  // Decision C4: a navigation, not a modal. The planner loads the writing
  // itself, so it no longer depends on this page having already fetched it.
  const handleOpenPlanner = useCallback((writingId) => {
    navigate(`/writing/${writingId}/plan`);
  }, [navigate]);

  // Stats
  const stats = useMemo(() => ({
    total: writings.length,
    inProgress: writings.filter(w => w.status === WRITING_STATUSES.IN_PROGRESS).length,
    totalWords: writings.reduce((sum, w) => sum + (w.currentWordCount || 0), 0)
  }), [writings]);

  return (
    <>
      <Navigation />

      <div className="writing-studio">
        {/* Header */}
        <motion.header
          className="writing-studio__header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="writing-studio__title-section">
            <h1 className="writing-studio__title">
              <Icon name="feather" size={32} strokeWidth={1.5} />
              Writing Studio
            </h1>
            <p className="writing-studio__subtitle">
              Canon-aware creative writing for your world
            </p>
          </div>

          <button
            className="btn btn--primary btn--lg"
            onClick={() => setShowCreateModal(true)}
          >
            <Icon name="plus" size={20} strokeWidth={2} />
            New Writing
          </button>
        </motion.header>

        {/* Stats Bar */}
        <motion.div
          className="writing-studio__stats"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="stat-card">
            <span className="stat-card__value">{stats.total}</span>
            <span className="stat-card__label">Total Writings</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value">{stats.inProgress}</span>
            <span className="stat-card__label">In Progress</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value">{stats.totalWords.toLocaleString()}</span>
            <span className="stat-card__label">Total Words</span>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div
          className="writing-studio__filters"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="filter-group">
            <div className="search-input">
              <Icon name="search" size={18} strokeWidth={2} />
              <input
                type="text"
                placeholder="Search writings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="filter-group">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Types</option>
              {Object.entries(WRITING_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Statuses</option>
              {Object.entries(WRITING_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="filter-select"
            >
              <option value="updated">Recently Updated</option>
              <option value="created">Recently Created</option>
              <option value="title">Title A-Z</option>
              <option value="words">Word Count</option>
            </select>
          </div>
        </motion.div>

        {/* Content */}
        {loading ? (
          <div className="writing-studio__loading">
            <div className="loader-spinner" />
            <p>Loading writings...</p>
          </div>
        ) : filteredWritings.length === 0 ? (
          <motion.div
            className="writing-studio__empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {writings.length === 0 ? (
              <>
                <Icon name="feather" size={64} strokeWidth={1} />
                <h2>Start Your First Story</h2>
                <p>Create novels, novellas, and short stories set in your world.</p>
                <button
                  className="btn btn--primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  <Icon name="plus" size={18} strokeWidth={2} />
                  Create Writing
                </button>
              </>
            ) : (
              <>
                <Icon name="search" size={48} strokeWidth={1} />
                <h2>No Matches Found</h2>
                <p>Try adjusting your filters or search term.</p>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            className="writing-studio__grid"
            variants={CONTAINER_VARIANTS}
            initial="hidden"
            animate="visible"
          >
            {filteredWritings.map((writing) => (
              <WritingCard
                key={writing.id}
                writing={writing}
                onOpen={handleOpen}
                onDelete={setWritingToDelete}
                onOpenPlanner={handleOpenPlanner}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateWritingModal
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onCreate={handleCreate}
          />
        )}

        {writingToDelete && (
          <DeleteConfirmModal
            writing={writingToDelete}
            onClose={() => setWritingToDelete(null)}
            onConfirm={handleDelete}
          />
        )}
      </AnimatePresence>

    </>
  );
}

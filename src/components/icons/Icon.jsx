/**
 * Icon.jsx - Unified Icon Component
 * 
 * PURPOSE:
 * Provides a centralized way to render icons throughout LineageWeaver.
 * Supports both Lucide icons (for UI elements) and custom SVG icons 
 * (for thematic/decorative elements).
 * 
 * USAGE:
 * <Icon name="tree" size={24} />           // Lucide icon
 * <Icon name="tree" size={24} variant="game" />  // Game-icons.net icon
 * 
 * ICON NAMING:
 * - Lucide icons use their standard names: 'users', 'shield', 'book-open'
 * - Game icons use kebab-case: 'oak', 'bordered-shield', 'open-book'
 */

import { forwardRef, useMemo } from 'react';

// Import Lucide icons we'll use throughout the app
import {
  // Navigation & UI
  TreeDeciduous,
  BookOpen,
  Shield,
  ShieldCheck,
  Settings,
  Users,
  User,
  Home as HomeIcon,
  Castle,
  Heart,
  Link2,
  Plus,
  FileText,
  Download,
  Upload,
  Search,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  X,
  Check,
  Edit,
  Pencil,
  Trash2,
  Copy,
  ExternalLink,
  Clock,
  Calendar,
  BarChart3,
  Sparkles,
  Zap,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  MoreVertical,
  Menu,
  Scroll,
  Crown,
  Swords,
  Sword,
  Anvil,
  Cog,
  Network,
  GitBranch,
  Library,
  BookMarked,
  ScrollText,
  FileEdit,
  PenTool,
  Lightbulb,
  Rocket,
  Info,
  AlertCircle,
  CircleAlert,
  HelpCircle,
  RefreshCw,
  // Additional icons for heraldry/forms/data
  Palette,
  Layers,
  Eye,
  EyeOff,
  Save,
  Star,
  Tag,
  Tags,
  Filter,
  Database,
  FolderOpen,
  FileArchive,
  GraduationCap,
  Map,
  MapPin,
  CheckCircle,
  XCircle,
  Grid3X3,
  List,
  LayoutGrid,
  Columns3,
  SlidersHorizontal,
  Move,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Image,
  ImagePlus,
  Globe,
  Sun,
  Moon,
  ArrowUpRight,
  Undo,
  Redo,
  Grip,
  UsersRound,
  FileUp,
  PartyPopper,
  HardDrive,
  HeartPulse,
  Wrench,
  AlertTriangle,
  Loader,
  RefreshCcw,
  Minus,
  ArrowUpDown,
  CheckSquare,
  LayoutList,
  // Additional missing icons
  Baby,
  ClipboardList,
  Play,
  Cloud,
  // Writing Studio icons
  Feather,
  StickyNote,
  Bold,
  Italic,
  Strikethrough,
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  ListOrdered,
  Quote,
  Type,
  // Dictation
  Mic,
  MicOff,
  // Story Planner icons
  Target,
  TrendingUp,
  BarChart2,
  Edit2,
  Edit3,
  Compass,
  GitCommit,
  Activity,
  Inbox,
  Lock,
  Unlock,
  Link as LinkIcon,
  Unlink
} from 'lucide-react';

/**
 * Map of icon names to Lucide components
 * This allows for easy swapping and customization
 */
const LUCIDE_ICONS = {
  // System navigation
  'tree': TreeDeciduous,
  'tree-deciduous': TreeDeciduous,
  'family-tree': Network,
  'codex': BookOpen,
  'book-open': BookOpen,
  'book': BookOpen,
  'library': Library,
  'book-marked': BookMarked,
  'armory': Shield,
  'shield': Shield,
  'shield-check': ShieldCheck,
  'forge': Anvil,
  'anvil': Anvil,
  'settings': Settings,
  'cog': Cog,
  
  // Entities
  'users': Users,
  'people': Users,
  'user': User,
  'person': User,
  'house': Castle,
  'castle': Castle,
  'building': Castle,
  'bonds': Heart,
  'heart': Heart,
  'relationship': Link2,
  'link': Link2,
  
  // Actions
  'add': Plus,
  'plus': Plus,
  'minus': Minus,
  'edit': Edit,
  'pencil': Pencil,
  'delete': Trash2,
  'trash': Trash2,
  'trash-2': Trash2,
  'copy': Copy,
  'export': Download,
  'download': Download,
  'import': Upload,
  'upload': Upload,
  'search': Search,
  'refresh': RefreshCw,
  'external': ExternalLink,
  'external-link': ExternalLink,
  'play': Play,
  
  // Navigation arrows
  'arrow-right': ArrowRight,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  'chevron-left': ChevronLeft,
  
  // Status & feedback
  'check': Check,
  'close': X,
  'x': X,
  'info': Info,
  'alert': AlertCircle,
  'alert-circle': AlertCircle,
  'circle-alert': CircleAlert,
  'help': HelpCircle,
  'warning': AlertCircle,
  
  // Time
  'clock': Clock,
  'time': Clock,
  'calendar': Calendar,
  
  // Decorative/Thematic
  'crown': Crown,
  'swords': Swords,
  'sword': Sword,
  'crossed-swords': Swords,
  'scroll': ScrollText,
  'scroll-text': ScrollText,
  'document': FileText,
  'file': FileText,
  'file-text': FileText,
  'file-edit': FileEdit,
  'pen': PenTool,
  'quill': PenTool,
  
  // Dashboard/Stats
  'stats': BarChart3,
  'chart': BarChart3,
  'sparkles': Sparkles,
  'magic': Sparkles,
  'zap': Zap,
  'lightning': Zap,
  'quick': Zap,
  
  // Misc
  'home': HomeIcon,
  'menu': Menu,
  'more': MoreHorizontal,
  'more-vertical': MoreVertical,
  'idea': Lightbulb,
  'lightbulb': Lightbulb,
  'rocket': Rocket,
  'network': Network,
  'branch': GitBranch,
  'grip': Grip,

  // Heraldry & Design
  'palette': Palette,
  'colors': Palette,
  'layers': Layers,
  'eye': Eye,
  'visible': Eye,
  'eye-off': EyeOff,
  'hidden': EyeOff,
  'image': Image,
  'image-plus': ImagePlus,

  // Form actions
  'save': Save,
  'star': Star,
  'favorite': Star,
  'tag': Tag,
  'tags': Tags,
  'filter': Filter,
  'sliders': SlidersHorizontal,
  'options': SlidersHorizontal,

  // Data management
  'database': Database,
  'data': Database,
  'folder': FolderOpen,
  'folder-open': FolderOpen,
  'archive': FileArchive,
  'file-archive': FileArchive,

  // Dignities
  'graduation': GraduationCap,
  'title': GraduationCap,
  'map': Map,
  'territory': Map,
  'map-pin': MapPin,
  'location': MapPin,
  'globe': Globe,
  'world': Globe,

  // Navigation arrows
  'arrow-left': ArrowLeft,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  'arrow-up-right': ArrowUpRight,
  'arrow-up-down': ArrowUpDown,

  // Feedback icons
  'check-circle': CheckCircle,
  'success': CheckCircle,
  'check-square': CheckSquare,
  'x-circle': XCircle,
  'error': XCircle,

  // Layout
  'grid': Grid3X3,
  'grid-view': Grid3X3,
  'list': List,
  'list-view': List,
  'layout-grid': LayoutGrid,
  'layout-list': LayoutList,
  'columns': Columns3,

  // Transform
  'move': Move,
  'drag': Move,
  'maximize': Maximize2,
  'fullscreen': Maximize2,
  'minimize': Minimize2,
  'rotate-left': RotateCcw,
  'rotate-ccw': RotateCcw,
  'rotate-right': RotateCw,
  'zoom-in': ZoomIn,
  'zoom-out': ZoomOut,
  'undo': Undo,
  'redo': Redo,

  // Theme
  'sun': Sun,
  'light': Sun,
  'moon': Moon,
  'dark': Moon,

  // Bulk import / additional icons
  'users-round': UsersRound,
  'file-up': FileUp,
  'party-popper': PartyPopper,
  'hard-drive': HardDrive,
  'heart-pulse': HeartPulse,
  'wrench': Wrench,
  'alert-triangle': AlertTriangle,
  'loader': Loader,
  'refresh-cw': RefreshCcw,
  'git-branch': GitBranch,

  // People & Life
  'baby': Baby,

  // Lists & Organization
  'clipboard-list': ClipboardList,

  // Cloud & Sync
  'cloud': Cloud,

  // Writing Studio icons
  'feather': Feather,
  'writing': Feather,
  'sticky-note': StickyNote,
  'note': StickyNote,

  // Text formatting
  'bold': Bold,
  'italic': Italic,
  'strikethrough': Strikethrough,
  'strike': Strikethrough,
  'type': Type,
  'text': Type,

  // Headings & paragraphs
  'pilcrow': Pilcrow,
  'paragraph': Pilcrow,
  'heading-1': Heading1,
  'heading-2': Heading2,
  'heading-3': Heading3,
  'h1': Heading1,
  'h2': Heading2,
  'h3': Heading3,

  // Lists
  'list-ordered': ListOrdered,
  'numbered-list': ListOrdered,

  // Block elements
  'quote': Quote,
  'blockquote': Quote,

  // Dictation
  'mic': Mic,
  'microphone': Mic,
  'mic-off': MicOff,

  // Story Planner icons
  'target': Target,
  'trending-up': TrendingUp,
  'bar-chart-2': BarChart2,
  'edit-2': Edit2,
  'edit-3': Edit3,
  'compass': Compass,
  'git-commit': GitCommit,
  'activity': Activity,
  'maximize-2': Maximize2,
  'rotate-cw': RotateCw,
  'inbox': Inbox,

  // Plot threads / Security
  'lock': Lock,
  'unlock': Unlock,
  'link-2': LinkIcon,
  'unlink': Unlink
};

/**
 * Icon Component
 * 
 * @param {Object} props
 * @param {string} props.name - Icon name (kebab-case)
 * @param {number} props.size - Icon size in pixels (default: 24)
 * @param {string} props.color - Icon color (default: currentColor)
 * @param {number} props.strokeWidth - Stroke width for Lucide icons (default: 2)
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.variant - 'lucide' (default) or 'game' for game-icons.net
 * @param {Object} props.style - Additional inline styles
 */
const Icon = forwardRef(function Icon(
  { 
    name, 
    size = 24, 
    color = 'currentColor',
    strokeWidth = 2,
    className = '',
    variant = 'lucide',
    style = {},
    ...props 
  }, 
  ref
) {
  // Build the className
  const iconClass = useMemo(() => {
    return `lw-icon lw-icon--${name} ${className}`.trim();
  }, [name, className]);
  
  // For Lucide icons
  if (variant === 'lucide') {
    const LucideIcon = LUCIDE_ICONS[name];
    
    if (!LucideIcon) {
      if (import.meta.env.DEV) {
        console.warn(`Icon "${name}" not found in Lucide icon map`);
      }
      return null;
    }
    
    return (
      <LucideIcon
        ref={ref}
        size={size}
        color={color}
        strokeWidth={strokeWidth}
        className={iconClass}
        style={style}
        aria-hidden="true"
        {...props}
      />
    );
  }
  
  // For game-icons.net SVGs (loaded as images)
  if (variant === 'game') {
    return (
      <span 
        ref={ref}
        className={`${iconClass} lw-icon--game`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          ...style
        }}
        aria-hidden="true"
        {...props}
      >
        <img 
          src={`/icons/${name}.svg`}
          alt=""
          width={size}
          height={size}
          style={{
            filter: color === 'currentColor' 
              ? 'var(--icon-filter, invert(1))' 
              : 'none'
          }}
        />
      </span>
    );
  }
  
  return null;
});

// Named exports for direct import of specific icons
export { LUCIDE_ICONS };

export default Icon;

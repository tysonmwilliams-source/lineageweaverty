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
import type { CSSProperties, HTMLAttributes, Ref, SVGProps } from 'react';

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
  Unlink,

  // Referenced by name across the app but absent from the map below, which made
  // Icon return null — 47 call sites rendered nothing at all.
  ChevronsUp,
  ChevronsDown,
  Loader2,
  Dna,
  LogOut,
  UserMinus,
  UserCheck,
  Film,
  GripVertical,
  Circle,
  CircleOff,
  Square,
  Grid3x3,
  SearchX,
  Briefcase,
  Medal,
  HeartHandshake,
  MousePointerClick,
  Dog,
  Bird,
  Scale,
  Sparkle,
  Link2Off,
  CalendarPlus,
  CalendarCheck,
  ScanSearch,
  Hourglass,
  Gavel,
  Stamp,
  FilePlus
} from 'lucide-react';
import { logger } from '../../utils/logger';

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
  'unlink': Unlink,

  // ── Names that were in use but unmapped ──────────────────────────────────
  // Every one of these was already referenced by a <Icon name="..." /> somewhere
  // in the app. Icon returns null for an unmapped name and only warns in DEV, so
  // in production these were simply invisible: loading spinners with no spinner,
  // drag handles with nothing to grab, empty status pips.
  'chevrons-up': ChevronsUp,
  'chevrons-down': ChevronsDown,
  'loader-2': Loader2,
  'dna': Dna,
  'log-out': LogOut,
  'user-minus': UserMinus,
  'user-check': UserCheck,
  'film': Film,
  'grip-vertical': GripVertical,
  'circle': Circle,
  'circle-off': CircleOff,
  'square': Square,
  'grid-3x3': Grid3x3,
  'search-x': SearchX,
  // Referenced from data/dignityEducation.js rather than from JSX, so
  // icon-map.test.jsx's literal scan could not see them and all three rendered
  // nothing — the office, honour and courtesy dignity badges were blank.
  'briefcase': Briefcase,
  'medal': Medal,
  'heart-handshake': HeartHandshake,
  'mouse-pointer-click': MousePointerClick,
  'dog': Dog,
  'bird': Bird,
  'scale': Scale,
  'sparkle': Sparkle,
  'link-2-off': Link2Off,
  'calendar-plus': CalendarPlus,
  'calendar-check': CalendarCheck,
  'scan-search': ScanSearch,
  'hourglass': Hourglass,
  'gavel': Gavel,
  'stamp': Stamp,
  'file-plus': FilePlus
};

/**
 * Icon Component
 * 
 * @param {Object} props
 * @param {string} props.name - Icon name (kebab-case)
 * @param {number} props.size - Icon size in pixels (default: 24)
 * @param {string} props.color - Icon color (default: currentColor)
 * @param {number} props.strokeWidth - Stroke width for Lucide icons (default: 2)
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'ref'> {
  /**
   * A key of `LUCIDE_ICONS` when `variant` is 'lucide', or a game-icons.net
   * file stem when it is 'game'.
   *
   * Typed `string` rather than `keyof typeof LUCIDE_ICONS`: half the call sites
   * compute the name (`categoryIcon`, a field off a stored record), so the
   * literal union would reject them all. An unknown name already warns in dev
   * and renders nothing.
   */
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
  /** 'lucide' (default) or 'game' for game-icons.net. */
  variant?: 'lucide' | 'game';
  style?: CSSProperties;
}

/**
 * The ref target depends on the variant: a lucide icon forwards to the `<svg>`,
 * a game icon to the wrapping `<span>`. The union says so rather than picking
 * one and casting the other away.
 *
 * No caller passes a ref today — the `forwardRef` is vestigial — which is why
 * the union costs nothing and is left in place rather than removed. Dropping it
 * would be a public-API change to a component 24 files import.
 */
const Icon = forwardRef<SVGSVGElement | HTMLSpanElement, IconProps>(function Icon(
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
    // `name` is a free-form string, so this can miss — which the guard below
    // already handles by warning in dev and rendering nothing.
    const LucideIcon = (LUCIDE_ICONS as Record<string, typeof LUCIDE_ICONS[keyof typeof LUCIDE_ICONS] | undefined>)[name];
    
    if (!LucideIcon) {
      if (import.meta.env.DEV) {
        logger.warn(`Icon "${name}" not found in Lucide icon map`);
      }
      return null;
    }
    
    return (
      <LucideIcon
        ref={ref as Ref<SVGSVGElement>}
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
        ref={ref as Ref<HTMLSpanElement>}
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
        {
          // The two variants render different element types from one prop set.
          // The props are declared as SVG attributes because that is what the
          // common case takes; the span branch narrows them here rather than
          // the type being widened to the intersection, which would accept
          // neither element's real attributes.
          ...(props as HTMLAttributes<HTMLSpanElement>)
        }
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

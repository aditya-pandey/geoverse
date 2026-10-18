// Bhoogol — components are plain CSS classes (components/bundle.css, prefix `bh-`);
// window.Bhoogol draws the brand's SVG artwork inline so it follows currentColor.

export type WorldSide = 'east' | 'west';
export type MarkKind = 'circle' | 'underline' | 'arrow' | 'tick' | 'sparkle';
export type KanchaTone = 'blue' | 'mint' | 'marigold';
export type IconName =
  | 'globe' | 'quiz' | 'compare' | 'layers' | 'search' | 'wildlife' | 'tour' | 'play' | 'river'
  | 'mountain' | 'ocean' | 'capital' | 'mark' | 'star' | 'sound' | 'settings' | 'share';

export interface BhoogolApi {
  /** One little world as an SVG string. east = Afro-Eurasia (marigold), west = the Americas (mint). */
  world(side?: WorldSide, opts?: { size?: number; shade?: boolean; mono?: string }): string;
  /** The two worlds side by side — the symbol. */
  twin(opts?: { size?: number; mono?: string }): string;
  /** The drawn "bhoogol" wordmark. Letters take `ink` (default currentColor); `mono` knocks the land out. */
  wordmark(opts?: { height?: number; ink?: string; mono?: boolean }): string;
  /** भूगोल, drawn to match the wordmark. */
  devanagari(opts?: { height?: number; ink?: string }): string;
  /** A teacher's mark in marigold (or `color`). `stretch` lets it fill a non-square box. */
  mark(kind?: MarkKind, opts?: { size?: number; color?: string; stretch?: boolean }): string;
  /** A kancha (marble) — the collectible reward. */
  kancha(tone?: KanchaTone, opts?: { size?: number }): string;
  /** A 24px rounded line icon in currentColor. */
  icon(name: IconName, opts?: { size?: number }): string;
  /** Fills data-bh-icon / -world / -twin / -logo / -mark / -kancha placeholders (+ data-bh-size). */
  hydrate(root?: ParentNode): void;
}

/** Button — `.bh-btn` + `--primary` (marigold) | `--blue` | `--quiet`; `--icon`, `--small`. */
export interface ButtonProps { variant?: 'primary' | 'blue' | 'quiet'; size?: 'default' | 'small'; iconOnly?: boolean; children?: unknown }
/** Chip — `.bh-chip`, toggled with aria-pressed. */
export interface ChipProps { pressed?: boolean; icon?: IconName; children?: unknown }
/** AnswerOption — `.bh-answer` with __key, __text, __state; aria-checked; data-state="correct|wrong|dim". */
export interface AnswerOptionProps { letter: string; state?: 'idle' | 'selected' | 'correct' | 'wrong' | 'dim'; children?: unknown }
/** CountryCard — `.bh-card` (sheet) with __handle, __head, __name, __alt, __fact, .bh-stats, __chips, __actions. */
export interface CountryCardProps { flag: string; name: string; altName?: string; fact: string; stats: { label: string; value: string }[] }
/** ScoreBar — `.bh-score` with __pts, __streak, __marbles. */
export interface ScoreBarProps { points: number; streak?: number; marbles?: KanchaTone[]; total?: number }
/** TeacherMark — `.bh-annotate.bh-annotate--circle|--underline` wrapping content, plus `.bh-note` in Kalam. */
export interface TeacherMarkProps { kind: MarkKind; note?: string; children?: unknown }
/** Toast — `.bh-toast` + `--success` | `--danger` | `--reward`. */
export interface ToastProps { tone?: 'info' | 'success' | 'danger' | 'reward'; children?: unknown }
/** SearchField — `.bh-search` with __field, __input, __list, __row (aria-selected). */
export interface SearchFieldProps { query?: string; results?: { flag: string; name: string; kind: string }[] }
/** MapLegend — `.bh-legend` with __title, __ramp (spans filled with seq-* or div-* tokens), __ticks. */
export interface MapLegendProps { title: string; ramp: 'sequential' | 'diverging'; ticks: string[] }
/** TabBar — `.bh-tabs` of `.bh-tab` (aria-current="page" on the active one). */
export interface TabBarProps { items: { icon: IconName; label: string; current?: boolean }[] }

declare global { interface Window { Bhoogol: BhoogolApi } }

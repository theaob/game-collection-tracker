# GameVault Design & Style Guide

This document outlines the styling architecture, custom classes, typography, variables, and components used across the GameVault frontend.

---

## 1. Design System & Variables

All styling configurations are declared as CSS custom properties under the `:root` scope.

### Typography
- **Primary Font Family**: `'Outfit', sans-serif` (imported from Google Fonts).
- **Weight classes used**:
  - `300` (Light)
  - `400` (Regular)
  - `500` (Medium)
  - `600` (Semi-Bold)
  - `700` (Bold)
  - `800` (Extra-Bold)

### Core Color Palette
- **Main Background (`--bg-main`)**: `#07090e` (Deep black/dark-blue background).
- **Sidebar Background (`--bg-sidebar`)**: `#0b0f17` (Slightly lighter shade for sidebar layout).
- **Glassmorphic Background (`--glass-bg`)**: `rgba(17, 24, 39, 0.65)` (Transparent gray overlay).
- **Glassmorphic Border (`--glass-border`)**: `rgba(255, 255, 255, 0.07)` (Sleek light-gray borders).
- **Glassmorphic Hover (`--glass-hover`)**: `rgba(255, 255, 255, 0.12)` (Brighter hover border/background).

### Primary Accents & Gradients
- **Primary Color (`--primary`)**: `#6366f1` (Indigo).
- **Primary Glow (`--primary-glow`)**: `rgba(99, 102, 241, 0.4)` (Indigo shadow color).
- **Gradient Primary (`--grad-primary`)**: `linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)`.
- **Gradient Primary Hover (`--grad-primary-hover`)**: `linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)`.

### Text Colors
- **Main Text (`--text-main`)**: `#f8fafc` (Off-white/slate).
- **Muted Text (`--text-muted`)**: `#94a3b8` (Slate-gray).
- **Dark Text (`--text-dark`)**: `#64748b` (Deep blue-gray).

### Status Themes & Glows
Each game status (Backlog, Playing, Completed, Abandoned) has its own corresponding signature color and glowing shadow:

| Status | Color CSS Property | Hex Value | Glow CSS Property |
| :--- | :--- | :--- | :--- |
| **Backlog** | `--color-backlog` | `#f59e0b` (Amber) | `--glow-backlog` (`rgba(245, 158, 11, 0.25)`) |
| **Playing** | `--color-playing` | `#10b981` (Emerald) | `--glow-playing` (`rgba(16, 185, 129, 0.25)`) |
| **Completed** | `--color-completed` | `#0ea5e9` (Sky-Blue) | `--glow-completed` (`rgba(14, 165, 233, 0.25)`) |
| **Abandoned** | `--color-abandoned` | `#f43f5e` (Rose) | `--glow-abandoned` (`rgba(244, 63, 94, 0.25)`) |

---

## 2. Layout & Layout Structures

### Sidebar (`.sidebar`)
- Fixed layout width of `280px` positioned at `left: 0`, `top: 0` with a full-viewport height `100vh`.
- Structured with `.sidebar-header` (containing the brand logo and gamepad icon), `.sidebar-nav` (containing nav triggers for views), and `.sidebar-footer` (aggregating mini stats and platform tags).

### Main Content Area (`.main-content`)
- Left-margin of `280px` to clear the sidebar.
- Contains the search action header and library content views.
- Fluid padding system adapts to responsive breakpoints.

### Catalog Views
- Supports **Grid View** (`.games-grid`) using standard CSS grid layout:
  ```css
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 24px;
  ```
- Supports **List View** via `.list-view-active` toggled on `body`. Modifies cards to row flow, smaller dimensions, and hides card badges.

---

## 3. Interactive Components

### Buttons (`.btn`)
Base utility properties include `display: inline-flex`, `font-size: 14px`, `font-weight: 600`, and `border-radius: 14px`.

- **Primary Button (`.btn-primary`)**:
  - Styled with `--grad-primary` gradient and glowing neon shadow overlay.
  - Scale transform and shadow expansion on `:hover`.
- **Secondary Button (`.btn-secondary`)**:
  - Styled with `.glass-bg` transparent border, backdrop filter blur, and custom subtle hover borders.
- **Danger Button (`.btn-danger`)**:
  - Custom gradient from `#f43f5e` (rose) to `#e11d48` (dark-rose).
  - Designed for destructive triggers (e.g. deletion confirmation).
- **Icon Button (`.icon-btn`)**:
  - Perfectly square aspect ratio (`aspect-ratio: 1`) for single icon prompts (e.g. settings cog).

### Modals (`.modal-backdrop` & `.modal-card`)
- **Overlay (`.modal-backdrop`)**:
  - Full-screen `100vw` by `100vh` absolute overlay styled with glassmorphism blur `backdrop-filter: blur(6px)` and overlay background `rgba(3, 7, 18, 0.8)`.
  - Animates on `.show` modifier class.
- **Card (`.modal-card`)**:
  - Slate dark background `#0f172a`, thin border wrapper, and rounded curves.
  - Scale and translate translation animation when container gets `.show`:
    ```css
    transform: translateY(20px) scale(0.95);
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    ```
- **Size Variations**:
  - `.modal-small` (max-width `480px` - used for settings and confirmations).
  - `.modal-medium` (max-width `680px` - used for detailed views).

### Game Cards (`.game-card`)
- Multi-layered component including cover artwork wrapper (`.game-cover-wrapper`), fallback gradient placeholders, dynamic status badges, and overlay control triggers.
- **Action Overlay (`.game-card-actions-overlay`)**:
  - Centered edit and delete quick triggers.
  - Fades in and slides up on card hover:
    ```css
    opacity: 0;
    transform: translate(-50%, -40%);
    transition: var(--transition-smooth);
    ```

---

## 4. Shared Confirmation Dialog Classes

One dialog (`#confirm-modal`) backs every destructive confirmation — deleting a game and overwriting the library on import. It is driven by the promise-based `askConfirmation()` helper, so the app never falls back to `window.confirm()`.

- **Wrapper (`.confirm-content`)**:
  Flex-column centering details text and highlighting identifiers. `strong` inside the message is promoted to `--text-main` to name the affected item.
- **Glowing Alert Wrapper (`.confirm-icon-wrapper`)**:
  - Circular structure (`width: 64px`, `height: 64px`, `border-radius: 50%`).
  - Utilizes `--color-abandoned` (rose/red) color scheme with light background alpha blend, a glowing box-shadow border, and custom SVG outline size:
    ```css
    background: rgba(244, 63, 94, 0.1);
    color: var(--color-abandoned);
    border: 1px solid rgba(244, 63, 94, 0.25);
    box-shadow: 0 0 15px rgba(244, 63, 94, 0.15);
    ```
- **Roles**: The dialog is an `alertdialog` with `aria-modal`, labelled by its title and described by its message. Cancel carries `data-autofocus`, so the safe action is focused on open.

---

## 5. Animations & Keyframes

GameVault includes smooth micro-animations to enhance user experience:

### Fade In / Slide Up
- Global fade animation for lists and details cards.
- **Pulse border (`pulse-border`)**:
  - Adds periodic glowing halos. Used for tracking active events (e.g. running sessions).
  ```css
  @keyframes pulse-border {
    0% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.4); }
    70% { box-shadow: 0 0 0 8px rgba(244, 63, 94, 0); }
    100% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0); }
  }
  ```

---

## 6. Responsive Breakpoints

Media queries are declared globally to guarantee responsiveness across devices:

- **Desktop (default layout)**: Sidebar occupies the left panel (`280px`), library layout expands dynamically.
- **Tablet / Mobile (`@media (max-width: 900px)`)**:
  - Sidebar layout converts to collapse panel.
  - Page contents margins reset to standard layout boundaries.
- **Mobile Details Layout (`@media (max-width: 600px)`)**:
  - Card details layout collapses to single vertical columns.
  - Covers resize dynamically.

---

## 7. Accessibility Conventions

Design decisions in this project are constrained by these rules; keep them intact when adding components.

- **Focus is always visible.** A single `:focus-visible` ring (`2px solid var(--primary)`, `2px` offset) applies globally. Inputs may add their own focus border, but must never remove the ring.
- **Anything clickable is a real control.** Status cards, sidebar platform rows, the import dropzone, rating stars, cover-search results and game cards are `<button>` elements (or carry `role="button"` plus `tabindex="0"` and Enter/Space handling). The `.status-card`, `.sidebar-list-item`, `.import-dropzone`, `.cover-search-item` and `.game-card` rules strip the user-agent button styling.
- **Hover-revealed UI must also appear on focus.** `.game-card:focus-within .game-card-actions-overlay` mirrors the hover rule, so keyboard users can reach the per-card actions.
- **Icon-only buttons carry `aria-label`.** `title` alone is not announced reliably.
- **Decorative graphics are hidden.** The floating background is `aria-hidden`, cover images use `alt=""` (the title is already adjacent), and star rows are a single `role="img"` with a written rating.
- **Motion is optional.** Everything animated is disabled under `prefers-reduced-motion: reduce`, and the background physics simulation does not even instantiate.
- **No inline event handlers.** The Helmet CSP sets `script-src-attr 'none'`, so `onclick`/`onerror` attributes silently never fire. Bind listeners in `app.js` instead.

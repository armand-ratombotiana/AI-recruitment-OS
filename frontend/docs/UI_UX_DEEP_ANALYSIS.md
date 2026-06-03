# AI Recruitment OS — Deep UI/UX Analysis

**Audit date:** June 3, 2026
**Auditor:** Senior UI/UX Designer & Frontend Expert
**Scope:** All pages, components, hooks, state management, design system
**Methodology:** Line-by-line code review against WCAG 2.1 AA, design system best practices, and enterprise SaaS standards (Linear, Notion, Lever, Greenhouse, Ashby)

---

## 0. EXECUTIVE SUMMARY

The AI Recruitment OS frontend demonstrates strong **brand consistency** (blue-600/purple-600 gradient, glassmorphism, generous spacing) and **modern interactions** (mesh blobs, floating cards, count-up animations, fade-in-scroll). The marketing surface is genuinely impressive and conversion-optimized.

**However, the product surface is dramatically inconsistent in quality.** The dashboard is excellent. The `/candidates`, `/jobs`, and `/interviews` pages are well-built. But six pages (`/ppe`, `/analytics`, `/ai-copilot`, `/workflows`, `/pipeline`, `/matching`, `/schedule`) are essentially **placeholder stubs** that create a jarring drop-off from the marketing promise. The user lands on a polished dashboard, clicks a nav item, and gets a static hardcoded list with no real functionality.

**The design system is hollow.** `tailwind.config.ts:5` is `theme: { extend: {} }` — no design tokens. All colors, spacing, and typography are hardcoded ad-hoc throughout. There are **11 unused UI components** (Tooltip, Progress, Avatar, Tabs, Calendar, Kanban, Chart, Pagination, FileUpload, Search, BarChart/LineChart/PieChart) — built but never wired up.

**Top 10 critical issues** (in priority order):
1. **Six "placeholder" pages** that look broken next to the polished ones
2. **Empty `tailwind.config.ts`** — no design tokens, brand consistency at risk
3. **Sidebar nav bugs** — Pipeline uses Workflow icon, Schedule uses Calendar (same as Interviews)
4. **Two parallel notification systems** (`useToast` and `NotificationProvider`) — dead code
5. **Two parallel search components** — `Search` (full) is unused, `GlobalSearch` (simpler) is used
6. **Settings/Workflows/Analytics/Matching/PPE ignore the `<Button>` component** — using raw `<button>` with hardcoded classes
7. **Settings page ignores `<Tabs>`, `<InputField>`, `<Switch>`** — uses raw HTML
8. **No page titles or breadcrumbs in dashboard header** — context-free top bar
9. **Hardcoded user data** ("John Doe", "Pro Plan", `demo@airos.io`) bleeding into prod-ready UI
10. **No 401/refresh handling in API client** — sessions silently break

---

## 1. DESIGN SYSTEM ANALYSIS

### 1.1 Tailwind Configuration (`tailwind.config.ts`)

**Current state (lines 1-9):**
```ts
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: { extend: {} },  // ← EMPTY
  plugins: [],
};
```

**Critical issue:** The design system is built on a void. There are no semantic tokens for brand colors, no typography scale, no spacing tokens, no shadows, no animation timing. Every color is a `tailwindcss` palette name picked ad-hoc (`blue-600`, `purple-600`, `slate-900`, `gray-50`, etc.) and every font-size is a raw number (`text-xs`, `text-sm`, `text-2xl`).

**Impact:**
- Brand color `#2563eb` (blue-600) appears in **84+** class strings
- `bg-white rounded-xl border border-gray-200` appears **40+** times — should be a `<Card>` variant
- `bg-gray-50` background appears **25+** times
- `text-2xl sm:text-3xl font-bold` (page H1) appears in **8** pages with slight variations
- Cannot theme (dark mode, white-label, A/B brand test) without rewriting everything

**Recommended tokens (see Section 9 for full config):**

### 1.2 Color Palette

**Current usage by frequency:**

| Token | Count | Purpose | Issue |
|---|---|---|---|
| `blue-600` / `blue-700` | ~120 | Brand primary, CTAs, active states | ✓ Consistent |
| `purple-600` | ~25 | Brand secondary, gradients | ✓ Consistent |
| `gray-50` / `gray-100` | ~50 | Surfaces, hover states | ✓ Consistent |
| `gray-500` / `gray-400` | ~80 | Secondary text, placeholders | ⚠️ Contrast: gray-400 = 3.5:1 on white (fails WCAG AA for normal text) |
| `green-500/600` | ~20 | Success, positive metrics | ✓ Consistent |
| `red-500/600` | ~15 | Error, destructive | ✓ Consistent |
| `amber/orange/yellow` | ~25 | Warning, attention | ⚠️ Inconsistent naming (`amber-500` vs `yellow-500` vs `orange-500`) |
| Ad-hoc gradients | ~40 | `from-blue-500 to-purple-600` etc. | ⚠️ No central definition |

**Issues:**
- `text-gray-400` (Candidates page line 188, 192, etc.) for "—" placeholders — fails WCAG AA
- `text-gray-300` for FAQ chevrons (line 786) — even worse
- `text-blue-200/80` and `text-blue-100/70` (login, register) — illegible
- The `gradient-text` class (globals.css:206) and the inline `bg-gradient-to-r` for h1 text are redundant

**Recommendations:**
- Add a semantic color scale in tailwind: `brand`, `surface`, `ink`, `accent`, `success`, `warning`, `danger`
- Use only 3 levels of "ink" (primary, secondary, muted) — kill `gray-300` and `gray-400` for text
- Add a 9-step `brand` scale with `--brand-50` through `--brand-900` for true dark-mode support
- Create a `Text` component for body text with `variant: 'primary' | 'secondary' | 'muted' | 'inverse'`

### 1.3 Typography

**Observed scale (inconsistent):**

| Use case | Class observed | Pages | Issue |
|---|---|---|---|
| Hero h1 (landing) | `text-4xl sm:text-5xl md:text-6xl lg:text-7xl` | 1 | Too large range; not used elsewhere |
| Page H1 (dashboard) | `text-2xl sm:text-3xl font-bold` | 8 | OK, but `font-bold` is heavy; consider `font-semibold` |
| Section h2 (landing) | `text-3xl sm:text-4xl lg:text-5xl font-bold` | 4 sections | Inconsistent — should be tokenized |
| Card title | `text-lg font-semibold` | Dashboard cards | OK |
| Subtitle / lead | `text-base sm:text-lg text-gray-500` | Sections | Inconsistent spacing |
| Body | `text-sm` | Most pages | OK |
| Helper / meta | `text-xs` | Most pages | OK but tight on mobile |
| Tag / chip | `text-[10px]` | Skills, badges, mini-labels | ⚠️ 10px is below readable; raise to 11px min |
| Mono / code | `text-[10px] font-mono` | Dashboard "Top 3% of applicants" | ⚠️ 10px again |

**Recommendations:**
- Define a type scale in `tailwind.config.ts`:
  ```ts
  fontSize: {
    'display-2xl': ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '700' }],
    'display-xl':  ['3.75rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
    'display-lg':  ['3rem', { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '700' }],
    'display-md':  ['2.25rem', { lineHeight: '1.2', fontWeight: '700' }],
    'display-sm':  ['1.875rem', { lineHeight: '1.25', fontWeight: '600' }],
    'title-lg':    ['1.125rem', { lineHeight: '1.4', fontWeight: '600' }],
    'body-lg':     ['1rem',     { lineHeight: '1.6' }],
    'body':        ['0.875rem', { lineHeight: '1.5' }],
    'body-sm':     ['0.8125rem',{ lineHeight: '1.5' }],
    'caption':     ['0.75rem',  { lineHeight: '1.4' }],
  }
  ```
- Set `baseFontSize: 16px` (current default) but lock to `0.875rem` for body via CSS
- Add a `<Heading level={1|2|3|4}>` component that picks the right token
- Add `<Text size="sm" tone="muted">` component for consistent text styles
- Replace `text-[10px]` and `text-[11px]` with `text-caption` (12px) and rebalance sizes

### 1.4 Spacing & Layout

**Current patterns:**

| Use | Class | Issue |
|---|---|---|
| Main content padding | `p-4 lg:p-6 pb-24` (layout.tsx:136) | `pb-24` is to clear the FAB, but FAB is `fixed`, this is unnecessary |
| Card padding | `p-6` (card.tsx:25, 61) | OK, but `pb-2` for header is weird (creates uneven top/bottom) |
| Section gap | `space-y-6` (most pages) | OK |
| Grid gap | `gap-4` (most) vs `gap-3` (some) vs `gap-6` (some) | ⚠️ Inconsistent |
| Sidebar nav gap | `space-y-0.5` (layout.tsx:76) | Too tight; should be `space-y-1` |

**Recommendations:**
- Define a 4-step spacing scale for content: `tight` (4), `comfortable` (6), `loose` (8), `section` (12)
- Set `Card` to have either `p-5` (compact) or `p-6` (default) variant, not arbitrary overrides
- Standardize grid gap to `gap-4` (or `gap-5` for larger cards)

### 1.5 Shadows & Elevation

**Observed patterns:**
- `shadow-sm` — subtle card (most)
- `shadow-lg`, `shadow-xl`, `shadow-2xl` — modals, hover states
- `shadow-blue-500/20`, `shadow-blue-500/25` — colored shadow for branded elements
- `hover-lift` (globals.css:213) and `card-hover` (globals.css:430) — **two different classes** doing the same thing

**Issue:** The two classes (`hover-lift` and `card-hover`) are nearly identical. Only `card-hover` is used; `hover-lift` is dead code (defined but not referenced).

**Recommendation:** Pick one, delete the other. Move to Tailwind utility classes (`hover:shadow-lg hover:-translate-y-0.5 transition`) and use the `cn()` helper. Add a 3-step shadow scale: `elevation-1`, `elevation-2`, `elevation-3`.

### 1.6 Motion & Animation

**Observed animations:**

| Class | Purpose | Source |
|---|---|---|
| `animate-fade-in-up` | Landing hero stagger | globals.css:170 |
| `animate-fade-in` | Generic | globals.css:197 |
| `animate-slide-down` | Mobile menu | globals.css:158 |
| `animate-scroll-dot` | Hero scroll indicator | globals.css:146 |
| `animate-pulse` | Loading skeletons | Tailwind built-in |
| `animate-spin` | Loading spinners | Tailwind built-in |
| `fade-in-scale` | Popovers, search dropdown | globals.css:423 |
| `slide-in-right` | Toasts | globals.css:411 |
| `meshFloat1-4` | Hero blobs | globals.css:78-102 |
| `pulse-ring` | Live indicator dot | globals.css:334 |
| `typingBounce` | (defined, not used) | globals.css:390 |
| `shimmer` | (defined, not used — Skeleton uses Tailwind's `animate-pulse` instead) | globals.css:342 |

**Issues:**
- `shimmer` and `typingBounce` are defined but not referenced anywhere
- The "mesh blob" animation runs indefinitely — OK for landing, but if the same component were reused in dashboard it'd be a perf hit
- No reduced-motion handling for the modal/dialog enter animations
- `prefers-reduced-motion` IS handled (globals.css:13-19) — ✓ good

**Recommendations:**
- Delete unused animations (`shimmer`, `typingBounce`, `hover-lift`) OR use them
- Standardize to 4 motion tokens: `fast` (150ms), `base` (200ms), `slow` (300ms), `slower` (500ms)
- Define easing: `ease-out-quart` for entries, `ease-in-out` for state changes
- Use `motion-safe:` and `motion-reduce:` Tailwind variants

### 1.7 Component Library Inventory

| Component | File | Used? | Quality |
|---|---|---|---|
| `<Button>` | `ui/button.tsx` | ✓ Yes (most pages) | High — 6 variants, 4 sizes, loading state |
| `<Card>` family | `ui/card.tsx` | ✓ Yes (dashboard) | Medium — no variants, padding fixed |
| `<Badge>` | `ui/badge.tsx` | ✓ Yes | High — 11 variants, dot support |
| `<DataTable>` | `ui/data-table.tsx` | ✓ Yes (candidates, jobs, interviews) | High — sort, page, column toggle, keyboard nav |
| `<Progress>` | `ui/progress.tsx` | ✗ **Never used** | Built but dead code |
| `<Avatar>` | `ui/avatar.tsx` | ✗ **Never used** | Built but dead code — pages do `c.full_name.split(' ').map(n=>n[0])` inline (8+ times) |
| `<Tabs>` | `ui/tabs.tsx` | ✗ **Never used** | Settings has raw buttons |
| `<Modal>` | `ui/modal.tsx` | ✓ Yes (candidates, jobs, interviews) | High — focus trap, ESC, scroll lock |
| `<Loading>` / `<Skeleton>` | `ui/loading.tsx` | ✓ Yes (dashboard, candidates) | High |
| `<EmptyState>` | `ui/empty-state.tsx` | ✓ Yes | Medium — no illustration, no help link |
| `<Tooltip>` | `ui/tooltip.tsx` | ✗ **Never used** | Built but dead code — settings has raw HTML |
| `<NotificationProvider>` | `ui/notification.tsx` | ✗ **Never used** | Built but dead code — `useToast` is used instead |
| `<BarChart/LineChart/PieChart>` | `ui/chart.tsx` | ✗ **Never used** | Built but dead code — Dashboard uses CSS bar chart |
| `<Search>` | `ui/search.tsx` | ✗ **Never used** | Built but dead code — `<GlobalSearch>` (less featured) is used |
| `<Pagination>` | `ui/pagination.tsx` | ✗ **Never used** | Built but dead code — DataTable has inline |
| `<FileUpload>` | `ui/file-upload.tsx` | ✗ **Never used** | Built but dead code — relevant for resume upload |
| `<Calendar>` | `ui/calendar.tsx` | ✗ **Never used** | Built but dead code — Interviews has raw calendar |
| `<Kanban>` | `ui/kanban.tsx` | ✗ **Never used** | Built but dead code — Pipeline has raw kanban |
| `<InputField/TextareaField/SelectField/CheckboxField>` | `ui/form-field.tsx` | ✗ **Never used in pages** | Excellent components — pages use raw HTML inputs |
| `useCountUp` | hooks | ✓ Yes (dashboard) | High |
| `useToast` | hooks | ✓ Yes (candidates, jobs, interviews, dashboard) | Medium — no description, no action |
| `useWebSocket` | hooks | ✗ **Never used** | Built but dead code |
| `useDebouncedValue` | hooks | ✓ Yes (global-search) | High |
| `useLocalStorage` | hooks | ✗ **Never used** | Built but dead code |
| `useClickOutside` | hooks | ✓ Yes (multiple) | High |
| `<StatsCard>` | `dashboard/stats-card.tsx` | ✓ Yes (dashboard) | Medium — see Section 2.2 |
| `<UserMenu>` | `dashboard/user-menu.tsx` | ✓ Yes (header) | Medium — hardcoded "John Doe" |
| `<NotificationsBell>` | `dashboard/notifications-bell.tsx` | ✓ Yes (header) | Medium — hardcoded notifications |
| `<QuickActionsFab>` | `dashboard/quick-actions-fab.tsx` | ✓ Yes | Medium |
| `<GlobalSearch>` | `dashboard/global-search.tsx` | ✓ Yes (header) | Medium — duplicates `<Search>` |
| `<Breadcrumb>` | `dashboard/breadcrumb.tsx` | ✓ Yes | High — but only shows on 2nd-level routes |

**Total components defined: 32 (24 UI + 7 dashboard + 1 index)**
**Used: 17 (53%)**
**Dead code: 15 (47%)**

This is a serious maintainability issue. Either wire up the built components, or delete them. Carrying 15 unused components means:
- 47% of the bundle is code that never renders
- Future developers waste time wondering "is this the right component?"
- Bugs in dead components go unnoticed
- Bundle size larger than necessary

---

## 2. PAGE-BY-PAGE ANALYSIS

### 2.1 Landing Page (`src/app/page.tsx`)

**Score: 8.5/10** — Excellent marketing page

**Strengths:**
- Hero with mesh gradient + floating cards is genuinely memorable
- Multiple social proof layers (trusted-by logos, 4-stat counter, 3 testimonials, 4.9★ rating, "500+ companies")
- Pricing comparison table goes beyond the typical 3-column grid
- FAQ with accordion handles objections well
- The "useCountUp" hook animation works beautifully on the stats bar (lines 268-273)
- Responsive: mobile menu with slide-down animation
- Accessibility: `aria-expanded`, `aria-controls`, `aria-pressed`, `aria-haspopup` all correctly used
- "How it works" has visual flow (line 545: connecting line between step icons)

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P1 | Hero `<h1>` gradient uses `from-blue-300 via-purple-300 to-pink-300` but brand is `blue-600 → purple-600`. The light version is fine for the dark hero, but the text is **barely readable** at the pink end (low contrast) | line 402 |
| 2 | P2 | Floating cards: translate values `-translate-x-[120%]` etc. are fragile (brittle at narrow widths) | line 431, 440, 453 |
| 3 | P2 | "Trusted by" logos are just text (TechScale, DataFlow) — looks amateurish vs. real logos | line 471-481 |
| 4 | P2 | Trust signal "4.9★ rating" is on the login page sidebar but the source is unclear | login:131 |
| 5 | P2 | Footer social links (Twitter, LinkedIn, GitHub) all point to `#` — broken UX | line 852-859 |
| 6 | P1 | Footer legal links also `#` — terms/privacy don't exist | line 866-873 |
| 7 | P1 | Subscribe form (`handleSubscribe`) is a fake handler — `setSubscribed(true)` then timeout. Real users will be confused. | line 281-288 |
| 8 | P2 | Pricing CTA all routes to `/register` — but `?plan=enterprise` param is not handled anywhere | line 706 |
| 9 | P2 | "Compare plans" table mixes `bool` and string values — Pro "Read-only" API access is undefined in `tier.features` but claimed in table | line 164-172 |
| 10 | P2 | Demo video placeholder is a static div with a Play button overlay — clicking does nothing | line 573-589 |
| 11 | P1 | `useCountUp` (line 269) creates 4 IntersectionObservers — one per stat. Not a perf issue per se, but the `<span ref={item.stat.ref}>` pattern is awkward | line 494 |
| 12 | P2 | The "Status dot" with `pulse-dot` (globals.css:316) is reused on "all systems operational" but it's misleading if there ARE no systems | line 849 |
| 13 | P2 | `<header>` is `<nav>` (line 292) but there's no `<main>` semantic structure for the page | line 290 |
| 14 | P2 | Mobile menu links don't get focus trapped — keyboard users can tab into the off-screen content | line 355-381 |
| 15 | P2 | No `<noscript>` fallback | layout.tsx |

**Improvements:**

1. **Fix the gradient text contrast** (line 402): Change `from-blue-300 via-purple-300 to-pink-300` to `from-blue-200 via-purple-200 to-pink-200` for AA compliance, OR add a subtle text-shadow for legibility.

2. **Make the hero CTAs sticky-visible on scroll** — when the user scrolls past the hero, a small "Start Free Trial" pill should appear (pattern: linear.app, vercel.com). Implement via IntersectionObserver on the hero section.

3. **Add real testimonial photos** — replace initials avatars with real photos (or use https://i.pravatar.cc/ — placeholder portraits) for credibility. Initials feel like a template.

4. **Wire up the subscribe form** to `/api/lead-capture` or at minimum a real form post. The current fake-success is a broken promise.

5. **Add an exit-intent modal** for the demo trial — show a discount / extended trial offer when user moves cursor toward the close button.

6. **Add a customer logos section with grayscale → color on hover** (current text-only section is weak). Consider licensing a set of plausible-looking logos (or use SVG marks).

7. **Make the video placeholder functional** — embed a Loom/YouTube video with `loading="lazy"`. The current "play button on dark gradient" is the universal signal of a non-existent demo.

8. **Implement `?plan=enterprise` query param** — when Enterprise CTA is clicked, route to `/register?plan=enterprise` and pre-fill the form with that context, OR show a contact-sales modal.

9. **Add `prefers-reduced-motion` respect for the mesh blobs** — current 15-22s animations should be disabled for users who set the OS preference (currently disabled globally via `animation-duration: 0.01ms` which kills ALL motion including helpful feedback).

10. **Replace the 4 stat counters** with the proper `<StatsCard>` component for consistency with the dashboard.

---

### 2.2 Login Page (`src/app/(auth)/login/page.tsx`)

**Score: 7.5/10** — Solid, with a few rough edges

**Strengths:**
- Two-column split with brand panel on left is the SaaS standard (Linear, Notion, Vercel)
- Form validation with inline error messages + green check on valid email (line 179-181)
- Password show/hide toggle
- 4 SSO options with official brand SVGs
- "Use demo credentials" link is a great developer experience
- Aria attributes for inputs are correct
- Focus management: email input auto-focuses (line 24-26)

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P1 | **Form submits via `window.location.href = '/dashboard'` (line 55)** — full page reload, defeats SPA benefits | line 55 |
| 2 | P1 | **Login button only shows spinner, no button label change** during loading (compared to register page line 247-248 which says "Signing you in...") | line 247 |
| 3 | P1 | **Demo credentials button is hardcoded** in production code — `fillDemo()` auto-fills `demo@airos.io` / `demo1234`. This is a real security/policy concern for a production app | line 78-84, 147-149 |
| 4 | P1 | **Error banner uses raw inline SVG** (line 153) instead of an icon component — inconsistent with rest of app | line 153 |
| 5 | P2 | **SSO buttons don't have visible provider icons** for `microsoft`, `linkedin`, `apple` until you look closely — the SVGs are 16x16 in a button that has `h-4 w-4` | line 279-289 |
| 6 | P2 | The brand panel says "AI-Native Recruitment Operating System" twice — once in H1 (line 102) and once in the description (line 105) | line 102-108 |
| 7 | P2 | "500+ companies · 4.9★ rating" trust signals at the bottom have no source — feels marketing-y | line 126-132 |
| 8 | P2 | The "Or continue with" divider has "OR CONTINUE WITH" in uppercase — could be lowercase for less aggressive tone | line 254 |
| 9 | P2 | "Forgot password?" link has `onClick={(e) => e.preventDefault()}` — dead link | line 196 |
| 10 | P2 | Error message in `catch` block (line 57) is generic — doesn't distinguish between 401, 429, 500 | line 57 |
| 11 | P2 | SSO error fallback message (line 72) is technical — should be friendlier for non-technical users | line 72 |
| 12 | P2 | Email success indicator (✓) is a raw SVG inside the input (line 180) — would be cleaner as a Lucide `Check` icon | line 180 |
| 13 | P2 | Login page doesn't use the `<InputField>` component — its own raw inputs don't get the password show/hide, success check, etc. for free | line 164-178, 199-212 |
| 14 | P3 | No rate-limit feedback — if user types wrong password 5 times, no warning or cooldown | (missing) |
| 15 | P3 | No "Sign in with passkey" option despite WebAuthn being a 2026 baseline | (missing) |
| 16 | P2 | Layout: when `lg:hidden` brand block is shown (line 138-143), it's a small mark — should still be visually balanced | line 138-143 |

**Improvements:**

1. **Replace `window.location.href` with `router.push('/dashboard')`** (line 55). This preserves React state, avoids re-fetching, and is faster.

2. **Add loading state label change** (line 247): `{isLoading ? 'Signing you in...' : 'Sign in'}` — matches register page.

3. **Make demo credentials env-conditional**:
   ```ts
   const SHOW_DEMO = process.env.NEXT_PUBLIC_ENABLE_DEMO === 'true';
   ```
   Then wrap the demo button in `{SHOW_DEMO && (...)}`. In production, hide it.

4. **Use the existing `<InputField>` component** — it already has built-in show/hide for password, success check for email, and proper a11y.

5. **Add specific error messages**:
   - 401 → "Incorrect email or password. Please try again."
   - 429 → "Too many attempts. Please wait a moment."
   - 5xx → "Something went wrong on our end. Please try again in a moment."

6. **Add rate-limit countdown** — show "Too many attempts. Try again in 45s" with a live timer.

7. **Add passkey (WebAuthn) button** — a 2026 enterprise baseline. Put it above the SSO options: "Sign in with passkey".

8. **Add a "Need help signing in?"** link below the form for enterprise customers.

9. **Remove the `e.preventDefault()` on "Forgot password"** — either wire it up to a real flow, or remove the link.

10. **Replace the raw inline SVGs** with Lucide icons (AlertCircle, Check, etc.) for consistency.

---

### 2.3 Register Page (`src/app/(auth)/register/page.tsx`)

**Score: 8/10** — Better than login in many ways

**Strengths:**
- Two-step flow (form → verify) with proper "check your inbox" state
- **Password strength meter with 5 visual rules** (line 232-258) is excellent UX
- The progressive strength bar (5 segments) + color coding is great
- Inline form validation
- Brand panel shows testimonial quote (line 144-154) — unique social proof at the sign-up moment
- "No credit card required" message in testimonial reduces friction

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P1 | Same `window.location.href` issue doesn't apply (line 73) but `error` is set when SSO fails — should redirect to error page or be a toast | line 73-78 |
| 2 | P1 | "Verify your email" state (line 81-105) has no way to **resend the email** if it didn't arrive | line 81-105 |
| 3 | P2 | Password strength labels (`STRENGTH_LABELS`) are not accessible — the strength bar has no `aria-valuenow` or `aria-valuemin/max` | line 232-244 |
| 4 | P2 | The strength meter shows 5 colors (`bg-gray-200, bg-red-500, bg-orange-500, bg-amber-500, bg-blue-500, bg-green-500`) but only 5 segments — index out of bounds for "Excellent" (index 5) is possible | line 24 |
| 5 | P2 | Terms checkbox text is long and the "Terms of Service", "Privacy Policy", "DPA" links are all `e.preventDefault()` — dead links | line 295 |
| 6 | P2 | No "Already have an account? Sign in" on the verify-email screen | line 99-101 |
| 7 | P2 | The email "verify" state doesn't show company name input — onboarding starts on a separate page (good) but no breadcrumb to know what happens next | line 81-105 |
| 8 | P2 | Full name field doesn't enforce a format (single line text, accepts anything) | line 180-193 |
| 9 | P2 | "Work email" placeholder is generic — no domain check (many enterprise users have personal emails) | line 197-211 |
| 10 | P2 | `STRENGTH_COLORS[strength]` — when `strength = 0` and password is empty, this returns `'bg-gray-200'` but the bar segments are always `bg-gray-200` so the indicator doesn't differentiate "empty" from "failing" | line 237-241 |
| 11 | P2 | Confirm password field has no real-time matching feedback (only on blur) | line 262-285 |
| 12 | P3 | No "company size" or "use case" capture at this stage — typical SaaS asks these for segmentation | (missing) |

**Improvements:**

1. **Add "Resend verification email"** button on the verify-email screen, with a 30s cooldown.

2. **Make the strength meter accessible**:
   ```html
   <div role="meter" aria-valuemin={0} aria-valuemax={5} aria-valuenow={strength} aria-label={`Password strength: ${STRENGTH_LABELS[strength]}`}>
   ```

3. **Wire up the Terms/Privacy/DPA links** — at minimum, link to placeholder pages.

4. **Add real-time password match feedback** to the confirm field:
   ```ts
   {confirmPassword && password === confirmPassword && <Check />}
   ```

5. **Add optional "Where did you hear about us?"** dropdown for marketing attribution.

6. **Add a "Sign in" link** to the verify-email screen.

7. **Fix the strength color off-by-one** — use `Math.min(passed, STRENGTH_COLORS.length - 1)` or use only 5 colors for 5 segments.

---

### 2.4 Dashboard Layout (`src/app/dashboard/layout.tsx`)

**Score: 6.5/10** — Functional shell with several bugs

**Strengths:**
- Sticky header with backdrop blur
- Sidebar with brand gradient + nav items + "Pro tip" footer card
- Mobile responsive with slide-in sidebar and backdrop
- Active route highlighting with gradient bg + colored dot
- Search, notifications, user menu in header

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P0 | **`/dashboard/pipeline` uses `WorkflowIcon` (line 32)** — wrong icon. Should be `KanbanSquare`, `Columns`, or similar | line 32 |
| 2 | P0 | **`/dashboard/schedule` uses `Calendar` icon (line 34)** — **same icon as `/dashboard/interviews`** (line 27). Visual confusion | line 27, 34 |
| 3 | P0 | **12 nav items in one flat list** — no grouping. At 1080p, the sidebar is already full and "Pro tip" footer card is partially cut off | line 23-36 |
| 4 | P1 | **No "Settings" badge or section** — settings is in the same list as primary nav. Should be in a separate "Account" group | line 35 |
| 5 | P1 | **No way to collapse the sidebar** — eats 256px of horizontal space permanently | (missing) |
| 6 | P1 | **The "Pro tip" card** at the bottom (line 108-118) is fixed in height, but the nav is `flex-1 overflow-y-auto`. On small laptops, the nav scrolls but the card stays — awkward | line 76, 108 |
| 7 | P1 | **`usePathname().startsWith(item.href)` for active state** (line 80) means visiting `/dashboard/candidates/123` highlights "Candidates" ✓ (good), but visiting `/dashboard` highlights nothing (bad — there's no active state for the dashboard root) | line 80 |
| 8 | P1 | **Header has no page title or breadcrumb** — just search + bell + user. Users have no context for "where am I" in the top bar | line 122-135 |
| 9 | P2 | **Sidebar is `w-64` (256px)** — too wide for a 13" laptop. 224px is the modern norm (Linear, Notion) | line 53 |
| 10 | P2 | **Sidebar opens over content with backdrop** (line 44-50), but on desktop the sidebar is permanent and pushes content via `lg:ml-64` — but the mobile "open" state doesn't have a close button visible on the open sidebar (the X is in the header, line 67-73) | line 67-73 |
| 11 | P2 | **`<aside>` with `aria-label="Sidebar navigation"`** (line 56) should semantically be `<nav>` or have `<nav>` inside it for the links | line 52-119 |
| 12 | P2 | **Active route indicator** is a gradient bg + colored dot. The dot (line 102) is small and the gradient is subtle. Make it more obvious | line 87-92, 102 |
| 13 | P2 | **No keyboard shortcut hint for sidebar** (e.g., `[G][D]` to go to Dashboard, `[G][C]` for Candidates) | (missing) |
| 14 | P2 | **"Workspace" label** (line 77) is the only section header — the 12 items are otherwise undifferentiated | line 77 |
| 15 | P2 | **The badge on "PPE" is missing** — `PPE` (Pair Programming Evaluation) is a niche feature. New users don't know what it is. Should have a tooltip or "?" icon | line 28 |
| 16 | P2 | **The "new" badge on AI Copilot** (line 30) is a `<span>` with `bg-green-100 text-green-700` — should use `<Badge>` for consistency | line 95-101 |
| 16 | P3 | **No skip-to-content link** for keyboard users | layout.tsx (missing) |

**Improvements:**

1. **Fix the icon bugs (P0)**:
   ```ts
   import { KanbanSquare, CalendarDays, LayoutDashboard, ... } from 'lucide-react';
   
   { href: '/dashboard/pipeline', label: 'Pipeline', icon: KanbanSquare, badge: '24' },
   { href: '/dashboard/schedule', label: 'Schedule', icon: CalendarDays },
   ```

2. **Group nav items into sections** (3 sections):
   - **Workspace** (default landing area)
     - Dashboard
     - Candidates
     - Jobs
     - Interviews
     - PPE
   - **Automate** (AI / workflows)
     - AI Copilot (new)
     - Workflows
     - AI Matching
     - Pipeline
   - **Insights**
     - Analytics
     - Schedule
   - **Account** (bottom, separated)
     - Settings
     - Help & docs (or in user menu)

3. **Make sidebar collapsible** — add a chevron in the header. Collapsed state shows icons only (56px wide), hover-expand on focus. Persist via `useLocalStorage`.

4. **Add page title in the dashboard header** (replaces the empty space between search and bell/user). E.g., "Candidates" + "124 candidates · 12 active". Use the route name to auto-populate, override via context.

5. **Use `<Badge>` component** for the "new" / "24" badges (line 95-101).

6. **Add a tooltip** on "PPE" explaining "Pair Programming Evaluation".

7. **Add a "?" icon next to "AI Copilot" with "new"** to link to a feature tour.

8. **Add keyboard shortcuts**:
   - `Cmd/Ctrl+B` — toggle sidebar
   - `Cmd/Ctrl+K` — open search (already implemented)
   - `Cmd/Ctrl+/` — open help

9. **Add a "What's new" announcement bar** at the top of the dashboard (collapsible) for the "AI Copilot is here!" announcement.

10. **Add skip-to-main link** in layout.tsx: `<a href="#main-content" class="sr-only focus:not-sr-only ...">Skip to content</a>`

---

### 2.5 Dashboard Home (`src/app/dashboard/page.tsx`)

**Score: 8.5/10** — The gold standard for this app

**Strengths:**
- Clean hierarchy: greeting + range picker → 4 KPI cards → 4 quick actions → 2-col (bar chart + funnel) → 2-col (activity + today) → recent candidates
- Skeleton loader is well-designed (DashboardSkeleton)
- Real-time feel from "2 min ago" timestamps and live "pulse-dot" indicators
- Animated stats with useCountUp
- Empty states handled for `TODAY` and `RECENT` (line 298-301, 330-332)
- Funnel chart with progress bar semantics
- Bar chart with custom tooltip (CSS-only)

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P1 | **All data is hardcoded** (lines 26-71: ACTIVITY, TODAY, RECENT, QUICK, BAR_DATA, FUNNEL) — the `data` from API is only used for the 4 stat cards (line 115-118). The bar chart, funnel, activity feed, and recent candidates don't use API data at all | line 26-71, 115-118 |
| 2 | P1 | **The "Quick actions" 4-card grid is small and uniform** — Add candidate, Create job, Schedule interview, Ask AI Copilot. These should be more prominent, possibly with their own section header | line 176-193 |
| 3 | P1 | **`<StatsCard>` has no hover state** (stats-card.tsx:9-27) — unlike cards on the rest of the page. Users expect to be able to click into a stat for details | stats-card.tsx |
| 4 | P1 | **No drill-down on KPIs** — "Total Candidates: 1,248 (+12.4%)" should be clickable to the candidates page filtered by "this period" | line 145-174 |
| 5 | P2 | **Stats Card icon container is `bg-blue-50 text-blue-600`** (stats-card.tsx:22) — all 4 stats get the same color. Should vary by context (e.g., red for issues, green for growth) | stats-card.tsx:22 |
| 6 | P2 | **Bar chart tooltip is `::after` pseudo-element with `data-value`** (globals.css:271-284) — doesn't work on touch devices | globals.css:271 |
| 7 | P2 | **Bar chart Y-axis** has no labels — users see 7 bars but no scale. Hard to read | line 207-219 |
| 8 | P2 | **Funnel chart** is hardcoded to 5 stages with arbitrary widths (line 65-71). `width: 100%` for "Applied" is not actually 100% of candidates — it's just visual | line 65-71 |
| 9 | P2 | **Funnel doesn't show conversion rates** between stages (e.g., "248→184 = 74% pass rate"). The data is there (`f.count`) but not visualized | line 235-247 |
| 10 | P2 | **"Recent activity" entries all have `Sparkles` icon** (line 270) regardless of activity type — should vary by action (user-add, screening, interview, etc.) | line 269-271 |
| 11 | P2 | **"Recent candidates" cards in 5-col grid** (line 333) — at `lg` breakpoint that's 5 cards in 1 row. On 13" laptops, the cards are ~200px wide and cramped. Make it 4-col max | line 333 |
| 12 | P2 | **All `RECENT` candidates have hardcoded scores 82-96** — even though the score color isn't differentiated. A score of 82 is barely above average but gets the same treatment as 96 | line 40-46 |
| 13 | P2 | **"Today" widget** is a flat list of 3 events with no "view calendar" link | line 287-313 |
| 14 | P2 | **`<Breadcrumb />` is called on every page** (line 143) — for `/dashboard` it returns `null` (breadcrumb.tsx:26) so the breadcrumb only shows on sub-pages. OK, but the dashboard home doesn't need it | line 143 |
| 15 | P2 | **The `AnimatedStat` component (line 83-86) is local to the page** — should be in a `dashboard/` or `ui/` folder for reuse | line 83-86 |
| 16 | P2 | **`<StatsCard>` doesn't take a `href` prop** for drill-down | stats-card.tsx |
| 17 | P2 | **`STATUS_COLORS` in dashboard (line 73-81) is local to the page** — same map exists in candidates/page.tsx. Consolidate | line 73-81 |
| 18 | P3 | **No "Welcome, set up your first job" empty-state CTA** for new accounts | (missing) |

**Improvements:**

1. **Wire the API data through to the charts and lists**:
   - `data.activity` → Recent activity (instead of ACTIVITY const)
   - `data.recent_candidates` → Recent candidates (instead of RECENT const)
   - `data.bar_chart` → Weekly activity (instead of BAR_DATA const)
   - `data.funnel` → Pipeline funnel (instead of FUNNEL const)

2. **Make `<StatsCard>` clickable** — add an optional `href` prop. When clicked, navigate to the relevant page with a `?since=7d` filter.

3. **Add color theming to `<StatsCard>`** — add a `tone: 'blue' | 'green' | 'amber' | 'purple'` prop. The `Pass Rate` card could be green (positive), the `Interviews This Week` purple, etc.

4. **Add Y-axis to bar chart** — show gridlines or just the max value (60 in this case).

5. **Make bar chart tooltip work on touch** — add a click handler that shows a tooltip, or use a hover-locked popup.

6. **Add conversion rate to funnel** — show `74%` between "Applied" and "Screened" stages as a label.

7. **Vary the activity icon** by `a.action` (screened → Bot, matched → Target, completed → CheckCircle, etc.).

8. **Cap the recent candidates grid at 4 columns** — change `lg:grid-cols-5` to `lg:grid-cols-4 xl:grid-cols-5`.

9. **Add a "What's new?" announcement bar** at the top — for the AI Copilot launch, a dismissible banner.

10. **Add color-coded score chips** — `c.score >= 90` green, `>= 75` blue, `< 75` amber.

11. **Pull `<AnimatedStat>` out** to `components/ui/count-up-stat.tsx`.

12. **Create a `lib/status-colors.ts`** for the `STATUS_COLORS` map shared between dashboard, candidates, etc.

---

### 2.6 Candidates Page (`src/app/dashboard/candidates/page.tsx`)

**Score: 8/10** — Most mature page after the dashboard

**Strengths:**
- Table + Grid view toggle
- Multi-select with bulk actions (export CSV, delete)
- Skill filter chips with "Min score" slider
- Status filter dropdown
- Search by name/email
- Add candidate modal with form
- Detail modal with full candidate info
- Toast notifications for actions
- Empty state with action button

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P1 | **Form in `AddCandidateForm` (line 374-420) uses raw inputs** instead of `<InputField>` from `form-field.tsx`. The InputField has password show/hide, success check, error states — the Add form gets none of that | line 374-420 |
| 2 | P1 | **`<input type="search">` for the search field has no submit handler** (line 221) — but it also has no debouncing. For 8 candidates it's fine, but at 1,000+ it'll fire on every keystroke | line 220-228 |
| 3 | P1 | **CSV export** uses `selected.size > 0 ? filtered.filter(c => selected.has(c.id)) : filtered` (line 129) — but doesn't quote/escape commas in field values (though `"...".replace(/"/g, '""')` is correct CSV escaping, line 131) | line 127-140 |
| 4 | P1 | **Bulk delete is permanent** (line 142-146) — no confirmation dialog. Enterprise users will lose data | line 142-146 |
| 5 | P1 | **"Add candidate" modal has no email validation feedback** during typing — only `onSubmit` | line 380-383 |
| 6 | P2 | **The "Min score" slider** (line 265) has no visual label or track styling — it's a native `<input type="range">` with default browser styles | line 264-266 |
| 7 | P2 | **Skill filter chips show only the first 8** (line 252) with no "show all" or typeahead | line 252 |
| 8 | P2 | **Grid view candidate cards don't show email** — only name, exp, skills, status, location, score. Email is shown in table view | line 305-340 |
| 9 | P2 | **No pagination on grid view** — table view has DataTable pagination, grid view shows all | line 304-340 |
| 10 | P2 | **`onRowClick` opens detail modal** (line 299) — but the row also has a checkbox column. Clicking a checkbox bubbles up and opens the modal (no `stopPropagation` on the row, but the column has `onClick={(e) => e.stopPropagation()}` on the input — good, but inconsistent) | line 154-160, 299 |
| 11 | P2 | **The detail modal** doesn't have edit / delete / schedule-interview actions | line 422-463 |
| 12 | P2 | **`<ToastContainer />`** is rendered in the page (line 203), but the layout also has a `<QuickActionsFab>` that renders a `<ToastContainer />` (quick-actions-fab.tsx:31). This means 2 ToastContainers on the dashboard layout | line 203, layout.tsx (QuickActionsFab) |
| 13 | P2 | **The `useMemo` for `allSkills` and `filtered`** is good (line 94-111) but `useMemo` deps don't include the function calls correctly in older React — fine for React 18 | line 94-111 |
| 14 | P2 | **No way to filter by job applied to** — candidates can be from different jobs, but there's no filter for that | (missing) |
| 15 | P2 | **`AddCandidateForm` has no "Upload resume"** option — relevant for this app | (missing) |
| 16 | P3 | **No URL state sync** — search/filter state is in component state, not URL. User can't share a filtered view | (missing) |

**Improvements:**

1. **Use `<InputField>` and `<SelectField>`** in `AddCandidateForm` (line 374-420) instead of raw inputs.

2. **Add confirmation dialog** for bulk delete:
   ```tsx
   <Modal isOpen={confirmBulkDelete} ...>
     <p>Delete {selected.size} candidates? This cannot be undone.</p>
     <Button variant="danger">Delete</Button>
   </Modal>
   ```

3. **Add a custom slider component** for "Min score" — use a styled `<input type="range">` with visible track and value indicator.

4. **Add a "Show all skills" button** or typeahead for the skill filter when there are > 8 skills.

5. **Add detail modal actions**:
   - "Send message" → opens email modal
   - "Schedule interview" → opens interview scheduler
   - "Enrich with AI" → triggers `enrichCandidate` API
   - "Move to stage" → status change dropdown

6. **Add a "Resume" upload field** to the Add form — use the unused `<FileUpload>` component.

7. **Sync filter state to URL** — `?status=interviewing&minScore=80&skill=React` so users can share/bookmark filtered views.

8. **Add edit functionality** — clicking "Edit" in the detail modal opens the same form pre-filled.

9. **Consolidate toast containers** — render `<ToastContainer />` once in the dashboard layout, remove from individual pages.

10. **Add an "Apply to job" field** to the Add form — for new candidates, you want to associate them with a job immediately.

---

### 2.7 Jobs Page (`src/app/dashboard/jobs/page.tsx`)

**Score: 7.5/10** — Good, but the wizard is the highlight

**Strengths:**
- 4 stat cards at the top (Total / Open / Applicants / Avg Time) — different from the dashboard's KPI cards, but should be reusable
- Search + status filter
- DataTable with proper columns
- **3-step wizard for job creation** (line 195-342) is well-designed: Basics → Requirements → Pipeline → Review
- Wizard has step indicator with checkmarks
- Wizard has "Cancel" on step 0 and "Back" on subsequent steps (good pattern)

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P1 | **The 4 stat cards (line 130-153) are inline, not using `<StatsCard>`** — should be the same component as the dashboard for consistency | line 130-153 |
| 2 | P1 | **The "Avg Time" stat is hardcoded to "12d"** (line 152) — not from API | line 152 |
| 3 | P1 | **The wizard "Pipeline" step (line 314-328) is misleading** — the title says "Pipeline" but the content is just a review summary, not a pipeline configuration | line 314-328 |
| 4 | P2 | **The "salary" column** in the table (line 90) doesn't show currency code — `formatSalary` returns `$120k - $160k` but it's assumed USD | line 44-48, 90 |
| 5 | P2 | **The "Applicants" column** shows a number with Users icon (line 96-99) — but the number doesn't link to a filtered candidate list | line 92-99 |
| 6 | P2 | **The wizard doesn't save drafts** — close the modal and all progress is lost | (missing) |
| 7 | P2 | **No "Requisition ID" field** — enterprise users need to track jobs by internal ID | (missing) |
| 8 | P2 | **The wizard's "Description" and "Requirements"** textareas (line 301-310) are too small (`rows={4}`) for job descriptions. Should be larger | line 301-310 |
| 9 | P2 | **No "Hiring manager" or "Recruiter" assignment** in the job creation flow | (missing) |
| 10 | P2 | **No "Public job board" toggle** — should the job be published to external boards? | (missing) |
| 11 | P2 | **ToastContainer is in the page** (line 115) — same duplication issue as candidates | line 115 |
| 12 | P2 | **The wizard doesn't allow rich text in description** — plain textarea. Real ATS systems have rich text | (missing) |
| 13 | P3 | **The "Posted" column shows `created_at` date** but no relative time (e.g., "3 days ago") | line 107-110 |
| 14 | P3 | **No way to clone a job** — common workflow is to clone an existing job and tweak | (missing) |

**Improvements:**

1. **Use `<StatsCard>` for the 4 stat cards** (line 130-153). Define a `<PageStats>` row component that takes 4 stat configs.

2. **Rename "Pipeline" step in the wizard** to "Review" or "Confirm" — it doesn't actually configure the pipeline.

3. **Add a "Configure hiring pipeline" step** before "Review" — let users pick the stages (Screening → Interview → Offer) per job.

4. **Add a "Save as draft" button** alongside "Continue" — recruiters often need to step away mid-flow.

5. **Make the description/requirements textareas larger** (`rows={8}`).

6. **Add a "Hiring manager" autocomplete** to step 0 (or step 1) — search from team members.

7. **Add an "External job boards" toggle** in step 2/3 — LinkedIn, Indeed, Glassdoor.

8. **Add relative dates** to the "Posted" column — use `formatDistanceToNow`.

9. **Add a "Clone" action** in the table — opens the wizard pre-filled.

10. **Add a currency picker** for salary.

11. **Allow rich text in description** — at minimum, support markdown. Better: a WYSIWYG editor.

---

### 2.8 Interviews Page (`src/app/dashboard/interviews/page.tsx`)

**Score: 7.5/10** — Solid with a critical bug

**Strengths:**
- 5 stat cards? No, just an "upcoming this week" highlighted panel
- Status + type filters
- List and Calendar view toggle
- **Calendar view** is custom but functional
- Status badges with proper colors
- "Join" action button on scheduled interviews
- Panel display with overlapping avatars

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P0 | **Calendar week-start bug** (line 266): `startOfWeek.setDate(today.getDate() - today.getDay() + 1)` — `getDay()` returns 0 for Sunday, so on Sunday this gives `1 - 0 + 1 = 2` (Tuesday), missing Monday and Sunday. The bug is the off-by-one for Sunday | line 266 |
| 2 | P0 | **The Calendar view** has no way to navigate to other weeks (no prev/next buttons, no "Today" button, no month picker) | line 274-309 |
| 3 | P1 | **`<Calendar>` component exists** (`ui/calendar.tsx`) but is not used. The page implements its own simplified version | (missing) |
| 4 | P1 | **Interview time is in UTC** (`scheduled_at: '2026-06-03T14:00:00'`) but no timezone is shown to the user. For global teams this is critical | line 60-72 |
| 5 | P1 | **"Panel" column** shows overlapping circles with initials (line 142-148), but initials like "JD" are not unique — two people with the same initials look identical | line 142-148 |
| 6 | P1 | **The "Join" button** (line 159) doesn't actually join anywhere — `onClick` is missing. For a "video interview" feature, this should at minimum open a modal with the meeting link | line 159 |
| 7 | P2 | **No "duration" column** — duration is shown as part of the "When" column subtext. Recruiters planning their day need to see durations clearly | line 121-128 |
| 8 | P2 | **"Upcoming this week" panel** (line 180-198) shows max 5 — for a busy recruiter, this is too few. Make it scrollable or paginated | line 185 |
| 9 | P2 | **Status filter is a single select** — should be a multi-select for "Scheduled OR In Progress" type queries | (missing) |
| 10 | P2 | **Schedule form** (line 312-369) doesn't have a "Send calendar invite" toggle (with .ics attachment) | (missing) |
| 11 | P2 | **No "Recruiter" or "Interviewer" field** — who scheduled this interview? | (missing) |
| 12 | P2 | **The form uses raw inputs** instead of `<InputField>` / `<SelectField>` | line 325-362 |
| 13 | P2 | **Type filter emojis** (📞 💻 👥 🏢) — feels childish for an enterprise product. Use icons | line 41-44 |
| 14 | P2 | **No bulk reschedule** — common need (interviewer sick day) | (missing) |
| 15 | P2 | **Calendar view's day cells** are fixed height (`min-h-[400px]`) — doesn't scale with content. Long days overflow | line 287-307 |
| 16 | P3 | **No interview feedback or score recording** in the table — the "completed" status doesn't show a score | (missing) |

**Improvements:**

1. **Fix the calendar week-start bug** (P0):
   ```ts
   const day = today.getDay();
   const diff = day === 0 ? -6 : 1 - day; // Sunday → -6, Monday → 0, etc.
   startOfWeek.setDate(today.getDate() + diff);
   ```

2. **Add navigation to the calendar** — prev/next week, "Today" button, month picker.

3. **Use the `<Calendar>` component** from `ui/calendar.tsx` (or delete the unused one and document why).

4. **Show timezone** — "Today, 2:00 PM (PST)" with a tooltip showing user's local TZ.

5. **Make "Join" actually join** — at minimum, open a modal with the meeting URL. Better: integrate with Zoom/Meet/Teams.

6. **Show panel member full names** on hover (tooltips on the initials).

7. **Use `<InputField>` / `<SelectField>`** in the schedule form.

8. **Replace type emojis** with Lucide icons (Phone, Code2, Users, Building).

9. **Add a "duration" column** or badge to the table.

10. **Add a "Send invite" checkbox** to the form, generating an ICS file.

11. **Add a "completed interviews" sub-tab** that shows scores and feedback.

12. **Add bulk reschedule** — select multiple → "Reschedule all".

---

### 2.9 PPE Page (`src/app/dashboard/ppe/page.tsx`)

**Score: 1.5/10** — Effectively a placeholder, not a feature

**Strengths:**
- Fetches problems from API (line 13)
- Two-pane layout: problem on left, code on right

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P0 | **Only 36 lines of code** — this is not a real feature, it's a scaffold | entire file |
| 2 | P0 | **`<textarea>` for code** (line 31) — no syntax highlighting, no line numbers, no auto-indent, no tab-key handling | line 31 |
| 3 | P0 | **No Monaco / CodeMirror editor** — for a "Pair Programming Evaluation" tool, this is a deal-breaker | (missing) |
| 4 | P0 | **No timer** — PPE sessions are timed (typical: 60-90 min) | (missing) |
| 5 | P0 | **No language selector** — `solution.py` is hardcoded | line 30 |
| 6 | P0 | **No test case runner** — the user can write code but can't run it | (missing) |
| 7 | P0 | **`<PPEEditor>` component exists** (`coding-editor/ppe-editor.tsx`) but is NOT USED in this page | (missing) |
| 8 | P0 | **No AI feedback** — "AI evaluation" is the entire value prop | (missing) |
| 9 | P0 | **No submit button** — the `result` state is set but never written to | (missing) |
| 10 | P1 | **No problem difficulty filter** — easy/medium/hard | (missing) |
| 11 | P1 | **No "Hint" button** — `api.requestHint` exists but isn't called | (missing) |
| 12 | P1 | **No candidate context** — which candidate is taking this session? | (missing) |
| 13 | P1 | **No session list** — for the recruiter, no list of past sessions to review | (missing) |
| 14 | P2 | **Layout: `style={{height:'calc(100vh - 140px)'}}`** (line 17) — fragile, hardcoded. Should use flex/grid | line 17, 25 |
| 15 | P2 | **No empty state** for when no problem is selected — just a centered text | line 27 |
| 16 | P2 | **No loading state** for `loading` — the variable is set but never used | line 11, 13 |
| 17 | P2 | **Problems are selected from a `<select>`** (line 20) — a list view with cards would be much better | line 20-23 |

**Verdict:** This page needs a **full rewrite**. The good news: `<PPEEditor>` exists and can be used. The bad news: even that component is probably a scaffold.

**Improvements:**

1. **Complete rewrite** to include:
   - Real code editor (Monaco via `@monaco-editor/react` — ~50KB, industry standard)
   - Language selector (Python, JavaScript, TypeScript, Go, Rust, Java)
   - Problem description with examples, constraints, test cases
   - Run button → executes against test cases
   - Submit button → full evaluation
   - Timer with pause/resume
   - AI hint button (uses `api.requestHint`)
   - Session history
   - Candidate context (which candidate is being evaluated)
   - Side-by-side: problem | editor | output/feedback
   - Difficulty filter and topic tags

2. **Use the existing `<PPEEditor>` component** (but verify it has the features needed; if not, expand it).

3. **Add a problem browser** — a card grid showing all available problems with difficulty, topic, and a "Start session" button.

---

### 2.10 Analytics Page (`src/app/dashboard/analytics/page.tsx`)

**Score: 1/10** — Placeholder

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P0 | **Only 32 lines of code** | entire file |
| 2 | P0 | **`<BarChart/LineChart/PieChart>` exist** in `ui/chart.tsx` — NOT USED | (missing) |
| 3 | P0 | **No charts at all** — just 3 KPI cards (Total Candidates, Active Jobs, Pass Rate) | line 25-29 |
| 4 | P0 | **Fetches `getAIPerformance` data** (line 12) but never uses it | line 12 |
| 5 | P0 | **Fetches `getPipelineAnalytics` data** (line 12) but never uses it | line 12 |
| 6 | P0 | **No breakdown by time** (despite the 7d/30d/90d picker) | (missing) |
| 7 | P0 | **No breakdown by source/job/team** | (missing) |
| 8 | P0 | **No AI performance metrics** (despite being a "AI Recruitment OS") | (missing) |
| 9 | P1 | **Loading state** is a hand-rolled `bg-gray-200 animate-pulse` (line 15) — should use `<Skeleton>` / `<SkeletonCard>` | line 15 |
| 10 | P1 | **No export** (PDF, CSV) | (missing) |
| 11 | P1 | **No comparison** (this period vs last period, this job vs company average) | (missing) |
| 12 | P1 | **No drill-down** — clicking a KPI should go to a detailed view | (missing) |
| 13 | P2 | **Range picker** (line 22) uses raw buttons, not the same style as dashboard | line 22 |
| 14 | P2 | **No date picker for custom range** | (missing) |

**Improvements:**

1. **Full rewrite** with:
   - Time-series line charts (candidates over time, hires over time)
   - Funnel chart (matches the dashboard)
   - Source breakdown (pie or bar: LinkedIn, Indeed, Referral, Direct)
   - Job-level performance (table: which jobs have highest pass rate?)
   - Recruiter performance (table: which recruiter moves candidates fastest?)
   - AI performance metrics (screening accuracy, interview score correlation with hire/no-hire)
   - Time-to-hire breakdown (mean, median, p90)
   - Cost-per-hire
   - Diversity metrics (with explicit privacy controls)
   - Comparison vs previous period
   - Export to PDF / CSV
   - Date range picker (preset + custom)

2. **Use `<BarChart/LineChart/PieChart>` from `ui/chart.tsx`** (or replace with Recharts/Chart.js).

---

### 2.11 AI Copilot Page (`src/app/dashboard/ai-copilot/page.tsx`)

**Score: 2.5/10** — Barely functional

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P0 | **Only 35 lines** — this should be a flagship feature, given "AI Copilot" is in the brand | entire file |
| 2 | P0 | **`<CopilotPanel>` component exists** (`ai-copilot/copilot-panel.tsx`) — NOT USED | (missing) |
| 3 | P0 | **No conversation sidebar** — past conversations are inaccessible | (missing) |
| 4 | P0 | **No suggested prompts** — empty chat is a cold start problem | (missing) |
| 5 | P0 | **No agent selector** — `agent_type: 'recruiting_copilot'` is hardcoded (line 15) | (missing) |
| 6 | P0 | **No streaming response** — full message appears at once | (missing) |
| 7 | P0 | **No context (which candidate/job am I looking at?)** | (missing) |
| 8 | P0 | **No rich responses** — plain text only, no tables/charts/links | (missing) |
| 9 | P0 | **No file attachments** (e.g., "Analyze this resume") | (missing) |
| 10 | P1 | **No code highlighting** in responses | (missing) |
| 11 | P1 | **No "Stop generation"** button while loading | (missing) |
| 12 | P1 | **No copy message button** | (missing) |
| 13 | P1 | **No "thumbs up/down"** feedback on responses | (missing) |
| 14 | P1 | **No conversation title** — just "AI Recruiting Copilot" | (missing) |
| 15 | P2 | **Loading state** is hand-rolled (line 26) — not the `<Skeleton>` component | line 26 |
| 16 | P2 | **No keyboard shortcut** to focus the input (e.g., `Cmd+/`) | (missing) |
| 17 | P2 | **No "export conversation"** to PDF/email | (missing) |

**Improvements:**

1. **Major expansion** with:
   - Conversation sidebar (left) with history
   - Suggested prompts (right or above input)
   - Agent selector (Recruiting Copilot, Sourcing Agent, Interview Coach, etc.)
   - Streaming responses with `EventSource` or `fetch` with reader
   - Markdown rendering in responses (with `react-markdown`)
   - Code blocks with syntax highlighting (`react-syntax-highlighter`)
   - Context bar showing "Viewing: Sarah Chen's profile" 
   - File attachments (resume upload)
   - Copy / regenerate / thumbs up/down on each message
   - "Stop generating" button
   - Conversation export

2. **Use `<CopilotPanel>`** (verify it has these features, expand if not).

---

### 2.12 Workflows Page (`src/app/dashboard/workflows/page.tsx`)

**Score: 1/10** — Placeholder

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P0 | **27 lines** | entire file |
| 2 | P0 | **"Create Workflow" button** (line 17) does nothing — no onClick | line 17 |
| 3 | P0 | **No visual workflow editor** — the value prop is "visual workflows" (from landing) | (missing) |
| 4 | P0 | **No template library** — users need starter workflows | (missing) |
| 5 | P0 | **No trigger/action builder** | (missing) |
| 6 | P0 | **No execution history** | (missing) |
| 7 | P0 | **No version control** (workflow versions, rollback) | (missing) |
| 8 | P1 | **Raw `<button>`** instead of `<Button>` | line 17 |
| 9 | P1 | **No filter** by active/inactive/template | (missing) |
| 10 | P1 | **No way to test/run a workflow** | (missing) |
| 11 | P1 | **No way to enable/disable** a workflow | (missing) |
| 12 | P1 | **No "Last run"** timestamp or success rate | (missing) |
| 13 | P2 | **Hand-rolled loading state** | line 19 |
| 14 | P2 | **No empty state** — just text | line 22 |

**Improvements:**

1. **Full rewrite** to include:
   - Template gallery ("Auto-screen new applicants", "Send rejection emails", "Schedule interviews", etc.)
   - Visual workflow builder (drag-drop nodes, like Zapier)
   - Trigger types: New application, Status change, Time-based, Manual
   - Action types: Send email, Move stage, Notify team, Update field, Call AI agent
   - Workflow run history with logs
   - Test mode
   - Enable/disable toggle
   - Duplicate workflow
   - Version history

---

### 2.13 Pipeline Page (`src/app/dashboard/pipeline/page.tsx`)

**Score: 1.5/10** — Static placeholder, duplicates Kanban

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P0 | **Hardcoded data** (line 3-8) — no API call | line 3-8 |
| 2 | P0 | **`<Kanban>` component exists** — NOT USED | (missing) |
| 3 | P0 | **No drag-and-drop** — the entire point of a pipeline view is drag to change stage | (missing) |
| 4 | P0 | **No real candidates** — just names in a list | (missing) |
| 5 | P0 | **No API integration** at all | (missing) |
| 6 | P0 | **No add/remove** from columns | (missing) |
| 7 | P1 | **No detail view** — clicking a candidate does nothing | line 24 |
| 8 | P1 | **No "by job"** filter — pipeline is per-job in real ATS | (missing) |
| 9 | P2 | **No counts at the top** (Total: 7 candidates) | (missing) |
| 10 | P2 | **Color circles** (line 18) are small — could be a colored bar on the left | line 17-19 |

**Improvements:**

1. **Use the `<Kanban>` component** (expand it to support drag-and-drop with `@dnd-kit/core`).

2. **Add real API integration** — fetch candidates grouped by stage.

3. **Add a job selector** at the top — "Pipeline for: [Senior Engineer ▾]".

4. **Add candidate cards** with avatar, name, score, days-in-stage.

5. **Add a summary footer** — total candidates, conversion to next stage.

---

### 2.14 Matching Page (`src/app/dashboard/matching/page.tsx`)

**Score: 1.5/10** — Placeholder with `Math.random()`

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P0 | **Match scores are `Math.floor(Math.random() * 20) + 80`** (line 29) — random numbers, not real AI matching | line 29 |
| 2 | P0 | **No actual matching** — the page just shows candidates with random scores | (missing) |
| 3 | P0 | **No "match" button** to trigger AI matching for a candidate | (missing) |
| 4 | P0 | **No explanation of WHY a match** — even with real scores, "98% match" is useless without reasoning | (missing) |
| 5 | P0 | **No filter** by job / by match score | (missing) |
| 6 | P1 | **No way to action matches** ("Send to recruiter", "Schedule interview") | (missing) |
| 7 | P1 | **Candidates and Jobs are shown in separate columns** — no clear "this candidate is a 95% match for this job" relationship | line 22-46 |
| 8 | P2 | **Hand-rolled loading** | line 17 |
| 9 | P2 | **Empty states** are just text (line 32, 44) | line 32, 44 |

**Improvements:**

1. **Build real matching** — use the `api.matchCandidate` and `api.predictSuccess` endpoints.

2. **Show match explanations** — "Sarah Chen is a 96% match because: 7y React exp, TypeScript, has scaled team to 5 engineers, located in SF (job location)".

3. **Show matches in a 2D matrix** — candidates on Y axis, jobs on X axis, color cells by match score. This is the killer feature of an "AI matching" page.

4. **Add an "Auto-match all" button** that runs AI matching for all candidates.

---

### 2.15 Schedule Page (`src/app/dashboard/schedule/page.tsx`)

**Score: 1/10** — Static placeholder, duplicates Interviews

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P0 | **Hardcoded data** (line 3-8) | line 3-8 |
| 2 | P0 | **No API call** | (missing) |
| 3 | P0 | **No real calendar view** | (missing) |
| 4 | P0 | **`<Calendar>` component exists** — NOT USED | (missing) |
| 5 | P0 | **Period picker** (line 16) buttons do nothing — no onClick | line 16 |
| 6 | P0 | **No event creation** | (missing) |
| 7 | P1 | **No connection to Interviews or PPE** — schedule should be a unified view of all upcoming events (interviews, PPE sessions, deadlines) | (missing) |
| 8 | P1 | **No team view** — see other team members' schedules | (missing) |
| 9 | P1 | **No notifications/reminders** for upcoming events | (missing) |
| 10 | P2 | **Color-coded left borders** (line 22) — only 3 colors used, hardcoded | line 22 |

**Recommendation:** **Delete this page** and consolidate with Interviews. Schedule is just "all upcoming events"; the Interviews calendar is a subset. Or: rebuild it as a true unified calendar (interviews + PPE + deadlines + team events).

---

### 2.16 Settings Page (`src/app/dashboard/settings/page.tsx`)

**Score: 3/10** — Barely functional

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P0 | **`<Tabs>` component exists** — NOT USED (line 11 uses raw buttons) | line 11 |
| 2 | P0 | **`<InputField>` exists** — NOT USED (line 12 uses raw inputs) | line 12 |
| 3 | P0 | **No `<Switch>` / `<Toggle>` component** — settings toggles use raw HTML (line 13) | line 13 |
| 4 | P0 | **No save feedback** — clicking "Save Changes" (line 12) does nothing visible | line 12 |
| 5 | P0 | **No form validation** | (missing) |
| 6 | P0 | **Hardcoded values** — "John Doe", "john@example.com" | line 12 |
| 7 | P0 | **No profile photo upload** | (missing) |
| 8 | P0 | **API key shown as plain text "sk-xxx..."** (line 15) — security issue and bad UX (no reveal/hide, no copy) | line 15 |
| 9 | P0 | **No "Generate new key" confirmation** (line 15) | line 15 |
| 10 | P0 | **No password strength meter** on the new password field (line 14) | line 14 |
| 11 | P0 | **No "current password" verification** for password change (well, it's there as a field, but no validation) | line 14 |
| 12 | P1 | **No team management** — settings should have "Team" tab | (missing) |
| 13 | P1 | **No billing tab** (in user menu, "Billing" links to `?tab=api` which is wrong) | user-menu.tsx:81-87 |
| 14 | P1 | **No "Delete account"** | (missing) |
| 15 | P1 | **No integrations page** (Greenhouse, Lever, etc.) | (missing) |
| 16 | P1 | **No "Connected accounts"** (Google, Microsoft SSO) | (missing) |
| 17 | P1 | **No "Active sessions"** (where you're logged in) | (missing) |
| 18 | P1 | **No "Email preferences" granularity** (per-notification-type) | (missing) |
| 19 | P2 | **No "Appearance"** (theme toggle) | (missing) |
| 20 | P2 | **No "Language"** | (missing) |

**Improvements:**

1. **Use `<Tabs>`** from `ui/tabs.tsx` (or build a proper one with a `TabsList` / `TabsTrigger` / `TabsContent` pattern).

2. **Use `<InputField>` / `<TextareaField>`** for all form fields.

3. **Build a `<Switch>` / `<Toggle>` component** (one doesn't exist) and use it for toggles.

4. **Add proper form sections** with headings and descriptions (e.g., "Profile" → "Update your personal information").

5. **Add save feedback** — toast on save, button shows "Saving..." then "Saved".

6. **Add API key management** — list keys with last-used, create/revoke, copy-to-clipboard with reveal.

7. **Add Team, Billing, Integrations, Security, Notifications** tabs.

8. **Add "Delete account"** at the bottom of Profile with a confirmation modal that requires typing "DELETE".

9. **Add a "Theme" preference** (light / dark / system).

---

### 2.17 Auth Callback Pages (`src/app/(auth)/callback/page.tsx` and `[provider]/page.tsx`)

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P0 | **TWO callback files exist** — `callback/page.tsx` (line 1-93) and `callback/[provider]/page.tsx` (line 1-129). Next.js will use the dynamic `[provider]` one for `/auth/callback/google`, but the static one will catch `/auth/callback`. The static one is **dead code**. | both files |
| 2 | P1 | **The static callback parses `window.location.pathname`** to get the provider (line 21) — hacky | callback/page.tsx:21 |
| 3 | P2 | **The dynamic callback has a 5-second countdown** (line 41-50) — confusing UX. Why 5 seconds? Let user click "Continue" or auto-redirect with no countdown | callback/[provider]/page.tsx:41-50 |
| 4 | P2 | **Both pages hardcode `Suspense` fallback** with the same spinner — should be a shared component | both files:85-92, 121-128 |
| 5 | P2 | **No state validation** — the static callback checks for `code` and `state` (line 19) but never validates `state` against the original (CSRF protection) | both files:18-19 |
| 6 | P3 | **No analytics events** for login success/failure | (missing) |

**Improvements:**

1. **Delete the static callback** (`callback/page.tsx`).

2. **Replace the 5-second countdown** with a "Continue to dashboard" button.

3. **Add CSRF state validation** — store the original `state` in `sessionStorage` and compare on callback.

4. **Track analytics events** for login flow (success, failure, SSO provider used).

---

## 3. GLOBAL UX ISSUES

### 3.1 Empty States

Only 4 pages have empty states:
- Dashboard (TODAY, RECENT)
- Candidates (`<EmptyState>`)
- Jobs (`<EmptyState>`)
- Interviews (`<EmptyState>`)

**6 pages have NO empty states** (just text):
- PPE
- Analytics
- AI Copilot
- Workflows
- Pipeline
- Matching
- Schedule
- Settings

**`<EmptyState>` component** is minimal:
```tsx
<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
  {icon && <div className="mb-4 text-gray-400">{icon}</div>}
  <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
  {description && <p className="mt-1 text-sm text-gray-500 max-w-sm">{description}</p>}
  {action && <div className="mt-4">{action}</div>}
</div>
```

**Improvements:**

1. **Add an illustration** to EmptyState (line 13-19) — currently just a gray icon. Use a stylized SVG (e.g., empty folder, empty inbox).

2. **Add a "What to do next" section** — for first-time users, show 3 quick-start steps.

3. **Add contextual help** — "Need help? Read the [guide]".

4. **Add an EmptyState variant with a CTA preview** — "Add your first candidate" with a thumbnail of the form.

### 3.2 Loading States

**Inconsistent across the app:**

| Page | Loading state | Quality |
|---|---|---|
| Dashboard | `DashboardSkeleton` with `<SkeletonCard>` | ★★★★★ |
| Candidates | `[1,2,3,4,5].map((i) => <Skeleton key={i} height={56} />)` | ★★★★ |
| Jobs | Same as candidates | ★★★★ |
| Interviews | Same | ★★★★ |
| PPE | `loading` state captured but never used | ★ |
| Analytics | `bg-gray-200 animate-pulse` divs | ★★ |
| AI Copilot | (none, but loading dots in chat) | ★★ |
| Workflows | `bg-gray-200 animate-pulse` divs | ★★ |
| Pipeline | (no loading) | ★ |
| Matching | `bg-gray-200 animate-pulse` divs | ★★ |
| Schedule | (no loading — hardcoded) | ★ |
| Settings | (no loading) | N/A |

**Recommendations:**

1. **Create a `<PageSkeleton>` component** with consistent page structure.

2. **Use `<SkeletonCard>` for cards, `<Skeleton>` for list rows, `<Skeleton variant="text">` for paragraphs**.

3. **Use the defined `.shimmer` class** in globals.css:342 (or delete it).

### 3.3 Error Handling

**Critical missing pieces:**

1. **No `<ErrorBoundary>`** anywhere — any uncaught error in a component crashes the whole page.

2. **API client (`client.ts:25`) throws on non-OK** but the error doesn't include the response body — users see generic "API error: 500" instead of the actual server message.

3. **No 401 handling** — if the token expires, the user sees raw error toasts on every action. Should auto-redirect to login.

4. **No retry logic** — flaky network = permanent failure.

5. **No offline detection** — actions can be triggered while offline, causing silent failures.

**Recommendations:**

1. **Add a `<ErrorBoundary>`** at the dashboard layout level. Show a friendly "Something went wrong" UI with "Try again" and "Go home" buttons.

2. **Improve `APIError`** to include response body and parse the server's error message:
   ```ts
   const body = await response.json().catch(() => ({}));
   throw new APIError(body.detail || `API error: ${response.status}`, response.status);
   ```

3. **Add 401 interceptor** in the API client — on 401, clear the token and redirect to login.

4. **Add a global error toast** for uncaught errors.

5. **Add an offline indicator** in the header.

### 3.4 Notifications & Toasts

**Two parallel systems exist:**

1. **`useToast` (hooks/index.ts:104-143)** — used in 4 pages. Basic: `push(type, message)`, 3.5s auto-dismiss, no description, no action, no progress.

2. **`<NotificationProvider>` / `useNotification` (ui/notification.tsx)** — never used. More advanced: title + description, action button, custom duration, position, max stack.

**Issues:**
- Two systems = maintenance burden + confusion for new devs
- The simpler `useToast` was chosen for use, but it's the lesser of the two
- No global notification provider wraps the app — pages manage their own `<ToastContainer />`

**Recommendations:**

1. **Pick one and delete the other.** Recommend keeping the advanced `NotificationProvider` (move `useToast` functionality to it as a thin wrapper).

2. **Wrap the dashboard layout in `<NotificationProvider>`** so notifications work globally.

3. **Remove `<ToastContainer />`** from individual pages.

### 3.5 Form Consistency

**Three different patterns in use:**

1. **`<InputField>` / `<TextareaField>` / `<SelectField>` / `<CheckboxField>`** — the "right" pattern, with proper a11y, password show/hide, success check, error states. **Used: 0 times in actual pages.**

2. **Raw `<input>` with manual classes** — used in login, register, AddCandidateForm, CreateJobWizard, schedule form. Different classes, different a11y, different error patterns.

3. **`<Button>`** is the "right" pattern for buttons. **Used in 60% of pages**; 5 pages use raw buttons.

**Recommendations:**

1. **Migrate all forms to `<InputField>` family** — login, register, AddCandidateForm, CreateJobWizard, ScheduleForm.

2. **Migrate all buttons to `<Button>`** — settings, analytics, ai-copilot, workflows, matching, pipeline, schedule.

3. **Standardize form layouts** — `<InputField>` already does this, but pages don't use it.

### 3.6 Accessibility (WCAG 2.1 AA)

**Issues found:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P1 | **No skip-to-content link** in layout.tsx | layout.tsx |
| 2 | P1 | **`text-gray-400`** for body text fails AA contrast (3.5:1 on white) | many places |
| 3 | P1 | **`text-gray-300`** fails AA (3.0:1) | FAQ chevrons, etc. |
| 4 | P1 | **Modal title ID is hardcoded** (`'modal-title'`) — multiple modals = duplicate IDs | modal.tsx:94 |
| 5 | P1 | **No focus trap in mobile sidebar** | layout.tsx |
| 6 | P1 | **Form errors not in live region** — screen readers don't announce them | login, register |
| 7 | P1 | **`text-[10px]`** skills tags (candidates) — too small to read | candidates/page.tsx:186, 188 |
| 8 | P1 | **The KPI "Welcome back, John"** doesn't include the user's name in a way screen readers can read it semantically | dashboard/page.tsx:124 |
| 9 | P2 | **The `<aside>` in dashboard layout** should be `<nav>` (with role if not) | layout.tsx:52 |
| 10 | P2 | **Decorative icons** (Bot, etc.) should have `aria-hidden="true"` — some are, some aren't | varies |
| 11 | P2 | **The hero gradient text** (landing) has `bg-clip-text text-transparent` — screen readers can't read gradient text (this is a known issue, requires `aria-label` on a hidden span) | page.tsx:402 |
| 12 | P2 | **No `lang` attribute on the `div`** that contains emoji in testimonials | page.tsx:112 |
| 13 | P2 | **Color-coded badges** (green/yellow/red for status) — colorblind users may not distinguish. Always pair with text/icon. | many |
| 14 | P2 | **Funnel chart bars** have `role="progressbar"` but no `aria-valuetext` for the percentage | dashboard/page.tsx:242 |
| 15 | P2 | **Bar chart `<div role="img">`** has `aria-label` but the data is on `data-value` on the bar — should be in a screen-reader-accessible table too | dashboard/page.tsx:207 |

**Recommendations:**

1. **Add skip-to-content link** in layout.tsx.

2. **Audit all `text-gray-400` and `text-gray-300`** — replace with `text-gray-500` (4.6:1, passes AA) or `text-gray-600` (7.0:1, passes AAA).

3. **Fix modal title ID** to be unique per modal:
   ```ts
   const titleId = `modal-title-${useId()}`;
   ```

4. **Wrap form errors in `<div role="alert" aria-live="assertive">`** so screen readers announce them.

5. **Add a hidden text alternative** for the gradient hero text:
   ```tsx
   <h1>
     <span aria-hidden="true" className="bg-gradient-to-r ...">is Autonomous</span>
     <span className="sr-only">is Autonomous</span>
   </h1>
   ```

6. **Add a `Switch` component** that's a proper accessible toggle (not a checkbox in a div).

7. **Run an a11y audit** with axe-core or Lighthouse — fix all AA violations.

### 3.7 Mobile / Responsive

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P1 | **`<table>` DataTable** on mobile (candidates, jobs, interviews) — `overflow-x-auto` means you scroll horizontally, which is awful. Real ATS apps use card view on mobile | data-table.tsx:176 |
| 2 | P1 | **The wizard** (job creation) doesn't go full-screen on mobile — 2-col grid is cramped | jobs/page.tsx:266-293 |
| 3 | P1 | **The mobile sidebar** (dashboard layout) — when open, search/bell/user in the header are still visible AND sidebar is on top. The backdrop has `aria-hidden="true"` but no focus trap | layout.tsx:44-50 |
| 4 | P2 | **Stat cards in 4-col grid** on mobile are 1-col, OK. But on tablet (`sm:` 640px) they're 2-col — too narrow for the value | varies |
| 5 | P2 | **`<textarea>` in PPE** — fixed height, doesn't grow on mobile | ppe/page.tsx:31 |
| 6 | P2 | **Pipeline page** has 4-col grid that becomes 1-col on mobile — fine, but cards have hardcoded widths | pipeline/page.tsx:14 |
| 7 | P3 | **The "Comparison plans" table** in landing has `overflow-x-auto` but is the only way to see it on mobile — should be a stacked card view | page.tsx:727 |

**Recommendations:**

1. **Add a card view for DataTable on mobile** (or replace the table entirely with cards).

2. **Make the modal wizard full-screen on mobile** (`sm:` → `sm:max-w-2xl sm:rounded-xl`).

3. **Add a focus trap to the mobile sidebar** (similar to Modal).

4. **Test on iPhone SE (320px wide)** — the smallest modern phone size. Some elements may break.

### 3.8 Performance

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | P2 | **`<table>` with 100+ rows** — DataTable paginates 10/page, but the sort and filter happen in `useMemo` on every render | data-table.tsx:69-83 |
| 2 | P2 | **`useCountUp` re-runs** on every `data` change in dashboard (line 268-273) — creates new IntersectionObservers | dashboard/page.tsx:268 |
| 3 | P2 | **No React.memo on `<StatsCard>`** — re-renders all 4 when any changes | stats-card.tsx |
| 4 | P2 | **`onChange` in search inputs** fires on every keystroke (no debounce) | candidates:220, jobs:160, interviews:203 |
| 5 | P2 | **15 unused components** in the bundle (Tooltip, Progress, Avatar, etc.) — increase JS bundle size | components/index.ts |
| 6 | P2 | **All 12 nav icons** imported in layout.tsx even though only one is needed per route | layout.tsx:7-20 |
| 7 | P3 | **`createElement` in `useToast`** (hooks/index.ts:113) — could just return JSX | hooks/index.ts |

**Recommendations:**

1. **Dynamic import nav icons** — `const Icon = dynamic(() => import('lucide-react').then(m => m.LayoutDashboard))`.

2. **Memoize `<StatsCard>`** with `React.memo`.

3. **Add debounce to search inputs** (200ms).

4. **Delete unused components** from `components/index.ts` (or use them).

---

## 4. USER JOURNEY ANALYSIS

### 4.1 New User Flow (Landing → Signup → Onboarding → First Use)

| Step | Page | Status | Issue |
|---|---|---|---|
| 1 | Landing (`/`) | ✓ Excellent | Demo video is fake |
| 2 | Sign up CTA | ✓ Works | `?plan=enterprise` param not handled |
| 3 | Register (`/register`) | ✓ Good | Terms links dead |
| 4 | Email verify | ⚠️ Minimal | No resend |
| 5 | **Onboarding** | ❌ **MISSING** | No onboarding flow! User is dropped at `/dashboard` |
| 6 | Dashboard | ✓ Good | Assumes data exists |
| 7 | Add first job | ✓ Good | 3-step wizard |
| 8 | Add first candidate | ✓ Good | Modal form |
| 9 | Run first AI screening | ❌ **MISSING** | No guidance on how to start |
| 10 | Schedule first interview | ✓ Good | Modal form |

**Critical issue:** There is **no onboarding flow**. A new user signs up, verifies email, and is dropped on the dashboard with no data and no guidance. They'll see "0 candidates", "0 jobs", empty charts, and the dashboard widgets will all show fallback values.

**Recommendations:**

1. **Build a 4-step onboarding flow** after email verification:
   - Step 1: Company profile (name, size, industry)
   - Step 2: Team invitations
   - Step 3: First job creation (pre-filled, just "Save")
   - Step 4: Connect job board (LinkedIn, Indeed) or skip
   - Final: "Welcome! Here's your first 3 actions:" dashboard

2. **Add contextual empty states** for first-time users — e.g., "Welcome to AI-ROS! Add your first job to start receiving applications." with a prominent CTA.

3. **Add a checklist widget** on the dashboard for new users:
   - [✓] Verify email
   - [ ] Add your first job
   - [ ] Invite a team member
   - [ ] Connect a job board
   - [ ] Try AI screening

### 4.2 Daily Use Flow

The main user loops:
1. **Check dashboard** — see activity, today's events
2. **Review new candidates** — approve/reject
3. **Schedule interviews** — pick time, panel
4. **Review interview feedback** — make decision
5. **Send offer** — close loop

**Each of these flows has issues:**
- "Review candidates" — there's no "needs review" queue. The candidates page shows all, not just pending review.
- "Interview feedback" — Interviews page has no feedback UI. Where does the interviewer record their notes?
- "Send offer" — no offer management at all.

### 4.3 Power User / Recruiter

Power users need:
- **Keyboard shortcuts** for common actions (Cmd+K is done, more needed)
- **Bulk actions** — only candidates has it; jobs/interviews don't
- **Saved searches/filters** — none
- **Saved views** (e.g., "My candidates in PPE") — none
- **Customizable dashboard** — no widget reordering
- **Quick add** (e.g., `Cmd+N` to add candidate from anywhere) — none

**Recommendations:** Add a "Power user" section to settings with toggleable shortcuts.

---

## 5. CONVERSION OPTIMIZATION (Landing Page)

| Element | Strength | Issue |
|---|---|---|
| Hero CTA | ✓ "Start Free Trial" + "See how it works" | Could add "Book a demo" for enterprise |
| Trust signals | ✓ 500+ companies, 4.9★ | No customer logos |
| Pricing | ✓ 3 tiers + comparison table | Enterprise "Custom" is vague |
| FAQ | ✓ 6 questions | Could add "Is there an API?" |
| Subscribe form | ⚠️ Fake handler | Wire to real backend |
| Footer | ✓ Comprehensive | All links dead |
| Social proof | ✓ 3 testimonials | Add video testimonial |

**Quick wins:**
1. Wire up the subscribe form
2. Add real customer logos
3. Fix footer legal links (point to placeholder pages)
4. Add a "Book a demo" CTA for the Enterprise tier

---

## 6. TECHNICAL DEBT

| Issue | Severity | Location |
|---|---|---|
| `useAuthStore` reads localStorage during SSR — hydration mismatch risk | P1 | stores/index.ts:18 |
| API client doesn't handle 401 — silent failure on expired token | P1 | client.ts:25 |
| API client doesn't parse error response body | P1 | client.ts:25 |
| No request timeout — long requests hang forever | P2 | client.ts:24 |
| No request retry — flaky network = failure | P2 | client.ts:24 |
| No request cancellation on unmount | P2 | many pages |
| Type safety: `useState<any[]>` everywhere | P1 | many pages |
| Magic numbers in styles (e.g., `text-[10px]`) | P2 | many places |
| Inline event handlers create new functions on every render | P3 | many places |
| `useToast` uses `createElement` instead of JSX | P3 | hooks/index.ts:113 |
| Duplicate `STATUS_COLORS` maps in dashboard + candidates | P2 | both files |

---

## 7. PRIORITIZED ISSUE LIST

### P0 — Critical (must fix before next release)
1. Fix sidebar nav icon bugs (Pipeline uses Workflow, Schedule uses Calendar)
2. Wire up or remove 6 placeholder pages (PPE, Analytics, AI Copilot, Workflows, Pipeline, Matching, Schedule)
3. Delete dead components or use them (15 unused)
4. Delete duplicate auth callback file
5. Build onboarding flow for new users
6. Fix `text-gray-400`/`text-gray-300` contrast issues (WCAG AA)
7. Add `<ErrorBoundary>` at layout level
8. Add 401 handling to API client
9. Make `<StatsCard>` drill-down capable
10. Add skip-to-content link

### P1 — Important (next sprint)
1. Add design tokens to `tailwind.config.ts`
2. Build the `<Tabs>`, `<Switch>` components or use them everywhere
3. Migrate all forms to `<InputField>` family
4. Migrate all buttons to `<Button>` component
5. Wire dashboard data to API (not hardcoded)
6. Add confirmation dialog for bulk delete
7. Fix calendar week-start bug
8. Make landing demo video work
9. Add real-time data refresh
10. Add empty states with illustrations
11. Consolidate to one notification system
12. Add keyboard shortcuts

### P2 — Nice to have (later)
1. Add dark mode
2. Add theme toggle
3. Build a true unified calendar
4. Add rich text in job descriptions
5. Add candidate portal
6. Add offer management
7. Add diversity metrics
8. Add export to PDF for reports
9. Add custom date range picker
10. Add saved searches

---

## 8. TOP 25 QUICK WINS (≤ 30 min each, high impact)

1. **Add design tokens to `tailwind.config.ts`** — single biggest improvement (see Section 9)
2. **Fix sidebar nav icon bugs** — change `WorkflowIcon` to `KanbanSquare` for Pipeline, change `Calendar` to `CalendarDays` for Schedule
3. **Replace raw `<button>` with `<Button>` component** in settings, workflows, matching, etc.
4. **Use existing `<InputField>` in AddCandidateForm** (candidates/page.tsx:374-420)
5. **Remove dead auth callback file** at `(auth)/callback/page.tsx`
6. **Consolidate toasts** — render `<ToastContainer />` in layout only, remove from individual pages
7. **Add `router.push` instead of `window.location.href` in login** (line 55)
8. **Connect UserMenu to real auth state** — replace hardcoded "John Doe" / "Pro Plan"
9. **Make `<StatsCard>` clickable** — add `href` prop
10. **Add page title to dashboard header** — show current page name
11. **Use `<Badge>` component** for the "new" / "24" badges in sidebar (layout.tsx:95-101)
12. **Fix calendar week-start bug** in interviews/page.tsx:266
13. **Remove `e.preventDefault()` on dead links** in login (line 196), register (line 295)
14. **Make demo credentials env-conditional** (login/page.tsx:78-84, 147-149)
15. **Add specific error messages** to login catch block (login/page.tsx:57)
16. **Use raw SVG → Lucide icons** in login (line 153, 180)
17. **Add skip-to-content link** in layout.tsx
18. **Cap the recent candidates grid at 4 columns** (dashboard/page.tsx:333)
19. **Replace `text-gray-400` for body text with `text-gray-500`** for AA contrast
20. **Add `aria-valuetext` to funnel chart** (dashboard/page.tsx:242)
21. **Add Y-axis to bar chart** (dashboard/page.tsx:207-219)
22. **Make `<StatsCard>` icon color themable** (stats-card.tsx:22)
23. **Add `<Tabs>` to settings** (settings/page.tsx:11)
24. **Replace `text-[10px]` with `text-xs`** for readable size
25. **Add `<Breadcrumb />` to dashboard root** (it currently returns null for `/dashboard`)

---

## 9. RECOMMENDED TAILWIND CONFIG

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',  // Enable class-based dark mode
  theme: {
    extend: {
      colors: {
        // Brand scale (blue)
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb', // PRIMARY
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        // Accent (purple)
        accent: {
          50:  '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        // Semantic surfaces
        surface: {
          0:   '#ffffff',
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        // Semantic text (passed AA contrast on white)
        ink: {
          primary:   '#0f172a',  // 19.3:1
          secondary: '#334155',  // 10.4:1
          muted:     '#64748b',  // 4.6:1
          disabled:  '#94a3b8',  // 2.8:1 (only for non-essential text)
          inverse:   '#ffffff',
        },
        // Status colors (semantic)
        success: { 50: '#f0fdf4', 500: '#10b981', 600: '#059669', 700: '#047857' },
        warning: { 50: '#fffbeb', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
        danger:  { 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
        info:    { 50: '#eff6ff', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        'display-2xl': ['4.5rem',  { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-xl':  ['3.75rem', { lineHeight: '1.1',  letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-lg':  ['3rem',    { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '700' }],
        'display-md':  ['2.25rem', { lineHeight: '1.2',  fontWeight: '700' }],
        'display-sm':  ['1.875rem',{ lineHeight: '1.25', fontWeight: '600' }],
        'title-lg':    ['1.125rem',{ lineHeight: '1.4',  fontWeight: '600' }],
        'body-lg':     ['1rem',    { lineHeight: '1.6',  fontWeight: '400' }],
        'body':        ['0.875rem',{ lineHeight: '1.5',  fontWeight: '400' }],
        'body-sm':     ['0.8125rem',{lineHeight: '1.5',  fontWeight: '400' }],
        'caption':     ['0.75rem', { lineHeight: '1.4',  fontWeight: '400' }],
      },
      spacing: {
        'section': '3rem',     // 48px — between major page sections
        'page':    '1.5rem',   // 24px — page padding
        'card':    '1.25rem',  // 20px — card padding
        'field':   '0.75rem',  // 12px — between form fields
      },
      borderRadius: {
        'sm': '0.25rem',
        DEFAULT: '0.5rem',
        'md': '0.5rem',
        'lg': '0.75rem',
        'xl': '1rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        'elevation-1': '0 1px 2px 0 rgba(15, 23, 42, 0.05)',
        'elevation-2': '0 4px 6px -1px rgba(15, 23, 42, 0.1), 0 2px 4px -2px rgba(15, 23, 42, 0.05)',
        'elevation-3': '0 10px 15px -3px rgba(15, 23, 42, 0.1), 0 4px 6px -4px rgba(15, 23, 42, 0.05)',
        'elevation-4': '0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.04)',
        'brand':       '0 4px 14px 0 rgba(37, 99, 235, 0.25)',
        'brand-lg':    '0 10px 30px 0 rgba(37, 99, 235, 0.35)',
      },
      animation: {
        'fade-in':       'fadeIn 0.3s ease-out',
        'fade-in-up':    'fadeInUp 0.5s ease-out',
        'fade-in-scale': 'fadeInScale 0.2s ease-out',
        'slide-in-right':'slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-down':    'slideDown 0.3s ease-out',
        'pulse-soft':    'pulse 2.5s ease-in-out infinite',
        'shimmer':       'shimmer 1.5s linear infinite',
        'mesh-float':    'meshFloat 20s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:      { from: { opacity: '0' }, to: { opacity: '1' } },
        fadeInUp:    { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        fadeInScale: { from: { opacity: '0', transform: 'scale(0.95)' }, to: { opacity: '1', transform: 'scale(1)' } },
        slideInRight:{ from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        slideDown:   { from: { opacity: '0', transform: 'translateY(-10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shimmer:     { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
        meshFloat:   { '0%, 100%': { transform: 'translate(0, 0) scale(1)' }, '50%': { transform: 'translate(30px, -30px) scale(1.05)' } },
      },
      transitionTimingFunction: {
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'in-out-quart': 'cubic-bezier(0.76, 0, 0.24, 1)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms')({ strategy: 'class' }),
    require('@tailwindcss/typography'),
  ],
};

export default config;
```

---

## 10. RECOMMENDED COMPONENT ADDITIONS

The codebase has many built-but-unused components. After wiring those up, the gaps are:

| Component | Purpose | Priority |
|---|---|---|
| `<Heading level={1-6}>` | Consistent page/section titles | P0 |
| `<Text size variant tone>` | Consistent body text | P0 |
| `<Switch>` | Accessible toggle (settings, etc.) | P0 |
| `<DatePicker>` | Date selection (interviews, etc.) | P0 |
| `<DateRangePicker>` | Analytics, custom ranges | P1 |
| `<RichTextEditor>` | Job descriptions, notes | P1 |
| `<CodeEditor>` | PPE page (or use Monaco directly) | P0 |
| `<Slider>` | Range input (candidate score filter) | P1 |
| `<Combobox>` | Typeahead (skill filter, candidate picker) | P1 |
| `<CommandMenu>` | ⌘K palette expansion (currently just nav) | P1 |
| `<OnboardingChecklist>` | New user guidance | P0 |
| `<KanbanBoard>` | Pipeline (drag-drop) | P0 |
| `<WorkflowBuilder>` | Visual workflow editor | P0 |
| `<CandidateComparison>` | Side-by-side candidate view | P2 |
| `<CalendarMonth>` | Full month view (interviews) | P1 |
| `<EmptyState>` (enhanced) | With illustration + tips | P1 |
| `<ErrorBoundary>` | Wrap layout | P0 |
| `<OfflineIndicator>` | Show when offline | P2 |
| `<ThemeToggle>` | Light/dark switch | P2 |

---

## 11. CONCLUSION

The AI Recruitment OS frontend has **strong bones** — excellent marketing page, well-designed dashboard, and a growing library of components. But the experience drops off dramatically as users navigate deeper:

- **Marketing:** 8.5/10 — conversion-ready
- **Auth:** 7.5/10 — solid but with rough edges
- **Dashboard:** 8.5/10 — the gold standard
- **Top 3 data pages (Candidates, Jobs, Interviews):** 7.5-8/10 — good
- **The other 6 pages (PPE, Analytics, AI Copilot, Workflows, Pipeline, Matching, Schedule):** 1-3/10 — placeholders

**The single biggest risk:** A new user signs up, lands on a polished dashboard, clicks "PPE" or "Workflows" and sees a 30-line static page. Trust evaporates.

**The single biggest opportunity:** Flesh out the placeholder pages and add an onboarding flow. The components, design language, and patterns are there — they just need to be applied consistently.

**The single most important quick win:** Add design tokens to `tailwind.config.ts`. This unlocks theming, dark mode, and consistency across the app without rewriting any components.

---

*End of analysis. See `UI_UX_ROADMAP.md` for the prioritized implementation plan.*

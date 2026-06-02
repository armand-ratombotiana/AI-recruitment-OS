# Plan: Fix Frontend Authentication Pages

## Current State Analysis

After reviewing all 6 files, the existing implementation already includes:

### Login Page (src/app/(auth)/login/page.tsx)
- ✅ Two-panel layout (left branding, right form)
- ✅ Logo SVG with "AI-ROS" brand name
- ✅ "AI-Native Recruitment Operating System" headline
- ✅ 3 bullet points about features
- ✅ "Welcome back" heading + subheading
- ✅ Email input with validation
- ✅ Password input with show/hide toggle (eye icon)
- ✅ "Remember me" checkbox
- ✅ "Forgot password?" link (styled, non-functional)
- ✅ "Sign In" button with loading state
- ✅ Error message display
- ✅ Divider "or continue with"
- ✅ 4 SSO buttons (Google, Microsoft, LinkedIn, Apple)
- ✅ "Don't have an account? Start free trial" link
- ❌ **Left panel gradient is gray, not blue-600 to purple-600**

### Register Page (src/app/(auth)/register/page.tsx)
- ✅ Same layout structure
- ✅ "Create your account" heading
- ✅ "Start your 14-day free trial" subheading
- ✅ Full name, email, password, confirm password inputs
- ✅ Password strength indicator (red/yellow/green)
- ✅ Terms checkbox
- ✅ "Create Account" button with loading state
- ✅ SSO buttons
- ✅ "Already have an account? Sign in" link
- ❌ **Left panel gradient is gray, not blue-600 to purple-600**

### Callback Page (src/app/(auth)/callback/page.tsx)
- ✅ Loading spinner while processing
- ✅ Reads provider from URL path
- ✅ Reads code from query params
- ✅ Calls api.ssoLogin()
- ✅ Redirects to /dashboard on success
- ✅ Error message with "Return to login" link
- ✅ Wrapped in Suspense boundary

### API Client & Store
- ✅ No changes needed - already functional

## Required Changes

### Change 1: Login Page Left Panel Gradient
**File:** `src/app/(auth)/login/page.tsx`
**Line:** 70
**Current:** `bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900`
**Required:** `bg-gradient-to-br from-blue-600 to-purple-600`

### Change 2: Register Page Left Panel Gradient
**File:** `src/app/(auth)/register/page.tsx`
**Line:** 70
**Current:** `bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900`
**Required:** `bg-gradient-to-br from-blue-600 to-purple-600`

## Implementation

Two simple `edit` operations to update the gradient colors.

## Verification

Run `npx next build --no-lint` to verify no build errors.

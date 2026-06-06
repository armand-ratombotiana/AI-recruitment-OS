# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: interviews.spec.ts >> Interviews page >> interviews list page loads with title and summary
- Location: tests\e2e\interviews.spec.ts:9:7

# Error details

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
```

```
TimeoutError: page.goto: Timeout 30000ms exceeded.
Call log:
  - navigating to "http://localhost:3000/login", waiting until "load"

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e7]:
    - generic [ref=e8]:
      - img [ref=e10]
      - generic [ref=e13]: AI-ROS
    - heading "AI-Native Recruitment Operating System" [level=1] [ref=e14]:
      - text: AI-Native Recruitment
      - text: Operating System
    - paragraph [ref=e15]: Autonomous AI agents that screen, interview, and match candidates — so your team can focus on what matters.
    - generic [ref=e16]:
      - generic [ref=e17]:
        - generic [ref=e18]: 🤖
        - generic [ref=e19]:
          - paragraph [ref=e20]: AI-powered candidate screening
          - paragraph [ref=e21]: 24/7 autonomous evaluation
      - generic [ref=e22]:
        - generic [ref=e23]: 💻
        - generic [ref=e24]:
          - paragraph [ref=e25]: Live pair programming interviews
          - paragraph [ref=e26]: Real-time AI feedback
      - generic [ref=e27]:
        - generic [ref=e28]: 🎯
        - generic [ref=e29]:
          - paragraph [ref=e30]: Intelligent hiring recommendations
          - paragraph [ref=e31]: 95% accuracy rate
    - generic [ref=e32]:
      - generic [ref=e33]: SOC2 compliant
      - generic [ref=e35]: 500+ companies
      - generic [ref=e36]: 4.9★ rating
  - generic [ref=e38]:
    - heading "Welcome back" [level=2] [ref=e39]
    - paragraph [ref=e40]: Sign in to your recruitment workspace
    - button "Use demo credentials" [ref=e41] [cursor=pointer]:
      - img [ref=e42]
      - text: Use demo credentials
    - generic [ref=e44]:
      - generic [ref=e45]:
        - generic [ref=e46]: Work email
        - textbox "Work email" [ref=e48]:
          - /placeholder: you@company.com
        - paragraph [ref=e49]: We'll never share your email.
      - generic [ref=e50]:
        - generic [ref=e51]:
          - generic [ref=e52]: Password
          - link "Forgot password?" [ref=e53] [cursor=pointer]:
            - /url: "#"
        - generic [ref=e54]:
          - textbox "Password" [ref=e55]:
            - /placeholder: ••••••••
          - button "Show password" [ref=e56] [cursor=pointer]:
            - img [ref=e57]
      - generic [ref=e61] [cursor=pointer]:
        - checkbox "Remember me for 30 days" [ref=e62]
        - generic [ref=e63]: Remember me for 30 days
      - button "Sign in" [ref=e64] [cursor=pointer]:
        - generic [ref=e65]: Sign in
        - img [ref=e67]
    - generic [ref=e73]: Or continue with
    - generic [ref=e74]:
      - generic [ref=e75]:
        - button "Sign in with Google" [ref=e76] [cursor=pointer]:
          - img [ref=e77]
          - text: Google
        - button "Sign in with Microsoft" [ref=e82] [cursor=pointer]:
          - img [ref=e83]
          - text: Microsoft
        - button "Sign in with LinkedIn" [ref=e88] [cursor=pointer]:
          - img [ref=e89]
          - text: LinkedIn
        - button "Sign in with Apple" [ref=e91] [cursor=pointer]:
          - img [ref=e92]
          - text: Apple
      - button "What is single sign-on?" [ref=e94] [cursor=pointer]:
        - img [ref=e95]
    - paragraph [ref=e97]:
      - text: Don't have an account?
      - link "Start free trial" [ref=e98] [cursor=pointer]:
        - /url: /register
```

# Test source

```ts
  1  | import type { Page, Locator } from '@playwright/test';
  2  | 
  3  | export const DEMO_EMAIL = 'demo@airos.io';
  4  | export const DEMO_PASSWORD = 'demo1234';
  5  | 
  6  | export class LoginPage {
  7  |   readonly page: Page;
  8  |   readonly emailInput: Locator;
  9  |   readonly passwordInput: Locator;
  10 |   readonly submitButton: Locator;
  11 |   readonly errorAlert: Locator;
  12 |   readonly demoButton: Locator;
  13 | 
  14 |   constructor(page: Page) {
  15 |     this.page = page;
  16 |     this.emailInput = page.locator('#email');
  17 |     this.passwordInput = page.locator('#password');
  18 |     this.submitButton = page.getByRole('button', { name: /sign in/i }).first();
  19 |     this.errorAlert = page.locator('[role="alert"]');
  20 |     this.demoButton = page.getByRole('button', { name: /use demo credentials/i });
  21 |   }
  22 | 
  23 |   async goto() {
> 24 |     await this.page.goto('/login');
     |                     ^ TimeoutError: page.goto: Timeout 30000ms exceeded.
  25 |     await this.emailInput.waitFor({ state: 'visible' });
  26 |   }
  27 | 
  28 |   async login(email: string, password: string) {
  29 |     await this.emailInput.fill(email);
  30 |     await this.passwordInput.fill(password);
  31 |     await this.submitButton.click();
  32 |   }
  33 | 
  34 |   async useDemoCredentials() {
  35 |     await this.demoButton.click();
  36 |   }
  37 | 
  38 |   async getError(): Promise<string | null> {
  39 |     if (await this.errorAlert.isVisible().catch(() => false)) {
  40 |       return (await this.errorAlert.textContent())?.trim() ?? null;
  41 |     }
  42 |     return null;
  43 |   }
  44 | }
  45 | 
```
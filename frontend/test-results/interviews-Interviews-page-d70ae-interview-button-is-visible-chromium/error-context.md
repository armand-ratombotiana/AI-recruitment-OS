# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: interviews.spec.ts >> Interviews page >> schedule interview button is visible
- Location: tests\e2e\interviews.spec.ts:49:7

# Error details

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
```

```
Tearing down "context" exceeded the test timeout of 30000ms.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
          - generic [ref=e47]:
            - textbox "Work email" [ref=e48]:
              - /placeholder: you@company.com
              - text: demo@airos.io
            - img [ref=e49]
          - paragraph [ref=e51]: We'll never share your email.
        - generic [ref=e52]:
          - generic [ref=e53]:
            - generic [ref=e54]: Password
            - link "Forgot password?" [ref=e55] [cursor=pointer]:
              - /url: "#"
          - generic [ref=e56]:
            - textbox "Password" [ref=e57]:
              - /placeholder: ••••••••
              - text: demo1234
            - button "Show password" [ref=e58] [cursor=pointer]:
              - img [ref=e59]
        - generic [ref=e63] [cursor=pointer]:
          - checkbox "Remember me for 30 days" [ref=e64]
          - generic [ref=e65]: Remember me for 30 days
        - button "Sign in" [ref=e66] [cursor=pointer]:
          - generic [ref=e67]: Sign in
          - img [ref=e69]
      - generic [ref=e75]: Or continue with
      - generic [ref=e76]:
        - generic [ref=e77]:
          - button "Sign in with Google" [ref=e78] [cursor=pointer]:
            - img [ref=e79]
            - text: Google
          - button "Sign in with Microsoft" [ref=e84] [cursor=pointer]:
            - img [ref=e85]
            - text: Microsoft
          - button "Sign in with LinkedIn" [ref=e90] [cursor=pointer]:
            - img [ref=e91]
            - text: LinkedIn
          - button "Sign in with Apple" [ref=e93] [cursor=pointer]:
            - img [ref=e94]
            - text: Apple
        - button "What is single sign-on?" [ref=e96] [cursor=pointer]:
          - img [ref=e97]
      - paragraph [ref=e99]:
        - text: Don't have an account?
        - link "Start free trial" [ref=e100] [cursor=pointer]:
          - /url: /register
  - alert [ref=e101]
```
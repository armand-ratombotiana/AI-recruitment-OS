# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pipeline.spec.ts >> Pipeline page >> pipeline kanban view loads with title and subtitle
- Location: tests\e2e\pipeline.spec.ts:9:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Tearing down "context" exceeded the test timeout of 30000ms.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - link "Skip to navigation" [ref=e3] [cursor=pointer]:
    - /url: "#primary-nav"
  - generic [ref=e4]:
    - complementary "Sidebar navigation" [ref=e5]:
      - link "AI-ROS" [ref=e7] [cursor=pointer]:
        - /url: /dashboard
        - img [ref=e9]
        - generic [ref=e12]: AI-ROS
      - navigation "Main" [ref=e13]:
        - paragraph [ref=e14]: Workspace
        - link "Dashboard" [ref=e15] [cursor=pointer]:
          - /url: /dashboard
          - img [ref=e16]
          - generic [ref=e21]: Dashboard
        - link "Candidates 24" [ref=e22] [cursor=pointer]:
          - /url: /dashboard/candidates
          - img [ref=e23]
          - generic [ref=e28]: Candidates
          - generic [ref=e29]: "24"
        - link "Jobs 5" [ref=e30] [cursor=pointer]:
          - /url: /dashboard/jobs
          - img [ref=e31]
          - generic [ref=e34]: Jobs
          - generic [ref=e35]: "5"
        - link "Interviews" [ref=e36] [cursor=pointer]:
          - /url: /dashboard/interviews
          - img [ref=e37]
          - generic [ref=e39]: Interviews
        - link "PPE" [ref=e40] [cursor=pointer]:
          - /url: /dashboard/ppe
          - img [ref=e41]
          - generic [ref=e45]: PPE
        - link "Analytics" [ref=e46] [cursor=pointer]:
          - /url: /dashboard/analytics
          - img [ref=e47]
          - generic [ref=e49]: Analytics
        - link "AI Copilot new" [ref=e50] [cursor=pointer]:
          - /url: /dashboard/ai-copilot
          - img [ref=e51]
          - generic [ref=e54]: AI Copilot
          - generic [ref=e55]: new
        - link "Workflows" [ref=e56] [cursor=pointer]:
          - /url: /dashboard/workflows
          - img [ref=e57]
          - generic [ref=e61]: Workflows
        - link "Pipeline" [ref=e62] [cursor=pointer]:
          - /url: /dashboard/pipeline
          - img [ref=e63]
          - generic [ref=e65]: Pipeline
        - link "AI Matching" [ref=e67] [cursor=pointer]:
          - /url: /dashboard/matching
          - img [ref=e68]
          - generic [ref=e70]: AI Matching
        - link "Schedule" [ref=e71] [cursor=pointer]:
          - /url: /dashboard/schedule
          - img [ref=e72]
          - generic [ref=e74]: Schedule
        - link "Settings" [ref=e75] [cursor=pointer]:
          - /url: /dashboard/settings
          - img [ref=e76]
          - generic [ref=e79]: Settings
      - generic [ref=e81]:
        - generic [ref=e82]:
          - img [ref=e83]
          - paragraph [ref=e85]: Press
        - paragraph [ref=e86]: Press ⌘K to open search and jump anywhere.
    - generic [ref=e87]:
      - banner [ref=e88]:
        - generic [ref=e90]:
          - img [ref=e91]
          - searchbox "Search" [ref=e94]
          - generic [ref=e95]: ⌘K
        - generic [ref=e96]:
          - 'button "Realtime status: Reconnecting" [ref=e97] [cursor=pointer]':
            - img [ref=e99]
            - generic [ref=e104]: Reconnecting
          - radiogroup "Theme" [ref=e105]:
            - radio "Light" [ref=e106] [cursor=pointer]:
              - img [ref=e107]
            - radio "Dark" [ref=e113] [cursor=pointer]:
              - img [ref=e114]
            - radio "System" [checked] [ref=e116] [cursor=pointer]:
              - img [ref=e117]
          - button "en" [ref=e120] [cursor=pointer]:
            - img [ref=e121]
            - generic [ref=e124]: EN
            - img [ref=e125]
          - generic [ref=e127]:
            - region "Notifications"
            - button "Notifications (0 unread)" [ref=e128] [cursor=pointer]:
              - img [ref=e129]
          - button "Open user menu" [ref=e133] [cursor=pointer]:
            - generic [ref=e134]: DU
            - img [ref=e135]
      - main [ref=e137]:
        - generic [ref=e138]:
          - region "Notifications"
          - generic [ref=e139]:
            - generic [ref=e140]:
              - generic [ref=e141]:
                - heading "Pipeline" [level=1] [ref=e142]
                - paragraph [ref=e143]: 0 candidates across 7 stages. Drag to move between stages.
              - button "Show tour" [ref=e144] [cursor=pointer]:
                - img [ref=e145]
            - button "Refresh" [ref=e149] [cursor=pointer]:
              - img [ref=e151]
              - generic [ref=e156]: Refresh
          - generic [ref=e157]:
            - status "Loading" [ref=e158]
            - status "Loading" [ref=e159]
            - status "Loading" [ref=e160]
            - status "Loading" [ref=e161]
            - status "Loading" [ref=e162]
            - status "Loading" [ref=e163]
            - status "Loading" [ref=e164]
      - region "Notifications"
      - button "Open quick actions" [ref=e166] [cursor=pointer]:
        - img [ref=e167]
  - region "Notifications" [ref=e168]:
    - alert [ref=e169]:
      - img [ref=e170]
      - generic [ref=e172]:
        - paragraph [ref=e173]: Reconnecting
        - paragraph [ref=e174]: Restoring real-time updates…
      - button "Dismiss notification" [ref=e175] [cursor=pointer]:
        - img [ref=e176]
  - alert [ref=e179]
```
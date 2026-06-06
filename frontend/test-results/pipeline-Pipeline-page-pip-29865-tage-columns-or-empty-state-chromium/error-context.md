# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pipeline.spec.ts >> Pipeline page >> pipeline shows stage columns or empty state
- Location: tests\e2e\pipeline.spec.ts:15:7

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
          - 'button "Realtime status: Offline" [ref=e97] [cursor=pointer]':
            - img [ref=e99]
            - generic [ref=e106]: Offline
          - radiogroup "Theme" [ref=e107]:
            - radio "Light" [ref=e108] [cursor=pointer]:
              - img [ref=e109]
            - radio "Dark" [ref=e115] [cursor=pointer]:
              - img [ref=e116]
            - radio "System" [checked] [ref=e118] [cursor=pointer]:
              - img [ref=e119]
          - button "en" [ref=e122] [cursor=pointer]:
            - img [ref=e123]
            - generic [ref=e126]: EN
            - img [ref=e127]
          - generic [ref=e129]:
            - region "Notifications"
            - button "Notifications (0 unread)" [ref=e130] [cursor=pointer]:
              - img [ref=e131]
          - button "Open user menu" [ref=e135] [cursor=pointer]:
            - generic [ref=e136]: L
            - img [ref=e137]
      - main [ref=e139]:
        - generic [ref=e140]:
          - region "Notifications"
          - generic [ref=e141]:
            - generic [ref=e142]:
              - generic [ref=e143]:
                - heading "Pipeline" [level=1] [ref=e144]
                - paragraph [ref=e145]: 0 candidates across 7 stages. Drag to move between stages.
              - button "Show tour" [ref=e146] [cursor=pointer]:
                - img [ref=e147]
            - button "Refresh" [ref=e151] [cursor=pointer]:
              - img [ref=e153]
              - generic [ref=e158]: Refresh
          - generic [ref=e159]:
            - status "Loading" [ref=e160]
            - status "Loading" [ref=e161]
            - status "Loading" [ref=e162]
            - status "Loading" [ref=e163]
            - status "Loading" [ref=e164]
            - status "Loading" [ref=e165]
            - status "Loading" [ref=e166]
      - region "Notifications"
      - button "Open quick actions" [ref=e168] [cursor=pointer]:
        - img [ref=e169]
  - region "Notifications"
```
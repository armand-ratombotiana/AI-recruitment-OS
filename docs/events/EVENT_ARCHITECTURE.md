# Event-Driven Architecture — Complete Event Specifications

## Event Taxonomy

| Domain | Prefix | Examples |
|--------|--------|----------|
| Candidate | `candidate.` | created, updated, enriched, ranked, deleted |
| Resume | `resume.` | uploaded, parsed, embedded, reprocessed |
| Job | `job.` | created, updated, opened, closed |
| Pipeline | `pipeline.` | created, stage_added, candidate_moved |
| Application | `application.` | submitted, stage_changed, withdrawn |
| Interview | `interview.` | scheduled, started, completed, cancelled |
| Evaluation | `evaluation.` | started, completed, explained, failed |
| PPE | `ppe.` | session_created, code_executed, evaluated |
| Workflow | `workflow.` | triggered, step_completed, approved, failed |
| AI | `ai.` | agent_spawned, task_assigned, task_completed |
| Notification | `notification.` | sent, delivered, read, failed |
| Analytics | `analytics.` | metric_collected, report_generated |
| Billing | `billing.` | subscription_changed, invoice_generated |
| Compliance | `compliance.` | policy_applied, consent_recorded |

## Event Schema Format

Every event follows this envelope:

```json
{
  "event_id": "uuid",
  "event_type": "candidate.created",
  "timestamp": "2025-01-15T10:30:00Z",
  "tenant_id": "tenant_abc",
  "correlation_id": "uuid",
  "causation_id": "uuid",
  "payload": { ... },
  "metadata": {
    "source": "candidate-service",
    "version": "1.0",
    "user_id": "user_123"
  }
}
```

## Core Event Flows

### 1. Resume Upload Flow

```
Candidate Portal
    │
    ▼
POST /resumes/upload
    │
    ▼
resume.uploaded ─────────────────────────────────────────────┐
    │                                                         │
    ▼                                                         │
[Resume Service]                                              │
    │ store file to S3                                        │
    │ create DB record                                        │
    ▼                                                         │
resume.parsing_started                                       │
    │                                                         │
    ▼                                                         │
[Celery Worker]                                               │
    │ extract text (PyMuPDF/python-docx)                      │
    │ OCR if image (Tesseract)                                │
    ▼                                                         │
resume.parsed ────────────────────────────────────────────┐   │
    │                                                      │   │
    ▼                                                      │   │
[AI Agent: Skill Extraction]                               │   │
    │ extract skills via LLM                                │   │
    ▼                                                      │   │
candidate.skills_extracted                                 │   │
    │                                                      │   │
    ▼                                                      │   │
[AI Agent: Candidate Profiling]                            │   │
    │ build profile, estimate seniority                     │   │
    ▼                                                      │   │
candidate.profile_enriched ───────────────────────────┐   │   │
    │                                                  │   │   │
    ▼                                                  │   │   │
[Embedding Service]                                    │   │   │
    │ generate vector embedding                        │   │   │
    ▼                                                  │   │   │
resume.embedded                                        │   │   │
    │                                                  │   │   │
    ▼                                                  │   │   │
[Semantic Matching Agent]                              │   │   │
    │ match against open jobs                          │   │   │
    ▼                                                  │   │   │
candidate.ranked                                       │   │   │
    │                                                  │   │   │
    ▼                                                  │   │   │
[Notification Service] ──► Recruiter notified          │   │   │
                                                     │   │   │
Event Store ◄────────────────────────────────────────┘   │   │
                                            (outbox)      │   │
                                            pattern       │   │
                                                          │   │
Analytics Service ◄──────────────────────────────────────┘   │
                                                              │
Search Index Service ◄───────────────────────────────────────┘
```

### 2. PPE Session Flow

```
POST /ppe/sessions
    │
    ▼
ppe.session_created
    │
    ▼
[AI Orchestrator]
    │ spawn PPE Agent
    │ select problem
    │ initialize sandbox
    ▼
ppe.session_started
    │
    ├──► Candidate connects via WebSocket
    │
    ▼
ppe.problem_presented
    │
    │    ┌──────────────────────────────────────┐
    │    │         CODING LOOP                  │
    │    │                                      │
    │    │  Candidate writes code               │
    │    │       │                              │
    │    ▼       ▼                              │
    │  ppe.code_submitted                       │
    │       │                                   │
    │       ▼                                   │
    │  [Code Sandbox] ──► ppe.code_executed     │
    │       │                                   │
    │       ├── All tests pass ──► ppe.test_passed
    │       │       │                           │
    │       │       ▼                           │
    │       │  [Follow-up question]             │
    │       │                                   │
    │       ├── Some fail ──► ppe.test_failed   │
    │       │       │                           │
    │       │       ├── Candidate requests hint │
    │       │       │   ──► ppe.hint_provided   │
    │       │       │                           │
    │       │       └── Candidate fixes code    │
    │       │           ──► (loop back)         │
    │       │                                   │
    │       └── Timeout ──► ppe.session_timeout │
    │                                      │    │
    │    └──────────────────────────────────┘    │
    │                                            │
    ▼                                            │
ppe.session_completed                            │
    │                                            │
    ▼                                            │
[AI Agent: Evaluation]                           │
    │ compute scores                              │
    │ generate reasoning                          │
    │ estimate seniority                          │
    ▼                                            │
ppe.evaluation_completed                         │
    │                                            │
    ▼                                            │
[Notification Service] ──► Recruiter notified     │
                                                    │
[Analytics Service] ◄──────────────────────────────┘
```

### 3. Interview Orchestration Flow

```
interview.requested
    │
    ▼
[Scheduling Agent]
    │ check interviewer availability
    │ check candidate availability
    │ find optimal time slot
    ▼
interview.slot_reserved
    │
    ▼
interview.scheduled
    │
    ├──► [Notification Service] ──► Email to candidate
    ├──► [Notification Service] ──► Email to interviewer
    ├──► [Calendar Integration] ──► Calendar invite
    │
    ▼ (at scheduled time)
interview.started
    │
    ├──► [AI Interview Agent] ──► Conducts interview
    │
    ▼
interview.completed
    │
    ▼
evaluation.submitted
    │
    ├──► [AI Evaluation Agent] ──► Scores responses
    ├──► [Communication Agent] ──► Analyzes communication
    │
    ▼
evaluation.completed
    │
    ▼
[Workflow Engine] ──► Check if all interviews complete
    │
    ├── No ──► Wait for remaining interviews
    │
    └── Yes ──► hiring.recommendation_requested
                    │
                    ▼
                [Hiring Recommendation Agent]
                    │ aggregate all evaluations
                    │ generate recommendation
                    ▼
                hiring.recommendation_generated
                    │
                    ▼
                [Workflow Engine] ──► Approval chain
                    │
                    ▼
                hiring.decision_made
```

## Outbox Pattern Implementation

```sql
-- Transactional outbox table
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(255) NOT NULL,
    aggregate_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published BOOLEAN DEFAULT FALSE,
    published_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 5
);

-- Index for polling publisher
CREATE INDEX idx_outbox_unpublished
    ON outbox_events (created_at)
    WHERE published = FALSE;
```

## Dead Letter Queue Strategy

| Retry | Delay | Action |
|-------|-------|--------|
| 1 | 1s | Automatic retry |
| 2 | 5s | Automatic retry |
| 3 | 30s | Automatic retry |
| 4 | 5min | Automatic retry |
| 5+ | — | Send to DLQ, alert ops |

## Saga Patterns

### Candidate Application Saga
```
Step 1: Submit Application → compensation: withdraw_application
Step 2: Parse Resume → compensation: delete_resume
Step 3: Extract Skills → compensation: remove_skills
Step 4: Generate Embedding → compensation: delete_embedding
Step 5: Match Against Jobs → compensation: remove_matches
Step 6: Notify Recruiter → compensation: (none)
```

### Interview Orchestration Saga
```
Step 1: Reserve Slot → compensation: release_slot
Step 2: Send Invitations → compensation: cancel_invitations
Step 3: Conduct Interview → compensation: cancel_interview
Step 4: Generate Feedback → compensation: delete_feedback
Step 5: Update Pipeline → compensation: revert_pipeline
```

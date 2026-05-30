# Multi-Agent AI System — Complete Architecture

## Agent Hierarchy

```
Global Orchestrator Agent
├── Task Planning Agent
├── Workflow Coordination Agent
├── AI Governance Agent
├── Candidate Intelligence Pool
│   ├── Resume Parsing Agent
│   ├── Resume Understanding Agent
│   ├── Candidate Profiling Agent
│   ├── Skill Extraction Agent
│   ├── Semantic Matching Agent
│   ├── Seniority Evaluation Agent
│   └── Candidate Ranking Agent
├── Interview Pool
│   ├── HR Interview Agent
│   ├── Technical Interview Agent
│   ├── Behavioral Interview Agent
│   ├── Coding Interview Agent
│   ├── PPE Evaluation Agent ★
│   ├── System Design Interview Agent
│   ├── Debugging Interview Agent
│   └── Communication Analysis Agent
├── Recruiter Support Pool
│   ├── Recruiter Copilot Agent
│   ├── Hiring Recommendation Agent
│   └── Talent Intelligence Agent
├── Workflow Pool
│   ├── Scheduling Agent
│   ├── Candidate Engagement Agent
│   └── Workflow Automation Agent
└── Knowledge Pool
    ├── RAG Retrieval Agent
    ├── Memory Management Agent
    └── Context Synchronization Agent
```

## Agent Communication Protocol

All agents communicate via `AgentMessage` objects:

```python
class AgentMessage:
    id: str                    # UUID
    sender_agent_id: str       # Sender agent ID
    receiver_agent_id: str     # None = broadcast
    message_type: str          # task_request | task_result | context_share | error
    payload: dict              # Message-specific data
    correlation_id: str        # Links request-response pairs
    timestamp: datetime
```

## Global Orchestrator Agent

### Role
Top-level coordinator that decomposes complex recruitment tasks into subtasks and distributes them to specialized agent pools.

### Decision Logic
1. Receive high-level task (e.g., "evaluate candidate for Senior Backend role")
2. Decompose into subtasks:
   - Resume parsing → Resume Parsing Agent
   - Skill extraction → Skill Extraction Agent
   - Semantic matching → Semantic Matching Agent
   - HR screening → HR Interview Agent
   - Technical evaluation → PPE Agent
   - Final recommendation → Hiring Recommendation Agent
3. Track progress across all subtasks
4. Aggregate results into final output
5. Handle agent failures with fallback strategies

### LangGraph Definition
```python
from langgraph.graph import StateGraph, END

class OrchestratorState(TypedDict):
    task: dict
    subtasks: list[dict]
    agent_results: dict
    current_phase: str
    error: str | None

graph = StateGraph(OrchestratorState)
graph.add_node("decompose", decompose_task)
graph.add_node("dispatch", dispatch_subtasks)
graph.add_node("monitor", monitor_progress)
graph.add_node("aggregate", aggregate_results)
graph.add_node("handle_error", handle_agent_error)

graph.set_entry_point("decompose")
graph.add_edge("decompose", "dispatch")
graph.add_conditional_edges("monitor", check_progress, {
    "all_complete": "aggregate",
    "has_error": "handle_error",
    "in_progress": "monitor",
})
graph.add_edge("handle_error", "dispatch")
graph.add_edge("aggregate", END)
```

## PPE Evaluation Agent — Detailed Specification

### Persona
- 15+ years of industry experience
- Staff/Principal engineer at FAANG
- Conducts 2-3 interviews per week
- Values problem-solving approach over syntax
- Believes in progressive difficulty and fair assessment

### Interview Flow

```
┌─────────────────────────────────────────────────────────┐
│                    PPE INTERVIEW FLOW                   │
│                                                         │
│  1. GREETING (30s)                                     │
│     - Welcome, set expectations                        │
│     - Explain the collaborative format                 │
│                                                         │
│  2. PROBLEM PRESENTATION (2min)                        │
│     - Present problem with examples                    │
│     - Explain constraints                              │
│     - Allow clarifying questions                       │
│                                                         │
│  3. CODING PHASE (15-25min)                            │
│     - Candidate thinks aloud                           │
│     - Writes code in shared editor                     │
│     - Agent observes and takes notes                   │
│     - Provides hints when requested                    │
│                                                         │
│  4. TESTING PHASE (3-5min)                             │
│     - Run test cases                                   │
│     - Debug failures                                   │
│     - Fix edge cases                                   │
│                                                         │
│  5. FOLLOW-UP PHASE (5-10min)                          │
│     - Complexity analysis                              │
│     - Alternative approaches                           │
│     - System design extension (for senior+)            │
│                                                         │
│  6. EVALUATION (2min)                                  │
│     - Compute scores                                   │
│     - Generate reasoning trace                         │
│     - Produce hiring recommendation                    │
└─────────────────────────────────────────────────────────┘
```

### Evaluation Rubric

| Dimension | Weight | Criteria | Scoring |
|-----------|--------|----------|---------|
| **Technical Skills** | 30% | Correctness, efficiency, algorithm quality, edge cases | 0-10 per criterion |
| **CS Fundamentals** | 20% | Big-O, tradeoffs, scalability, data structures | 0-10 per criterion |
| **Code Quality** | 15% | Readability, maintainability, modularity, naming | 0-10 per criterion |
| **Problem Solving** | 20% | Decomposition, reasoning, debugging, optimization | 0-10 per criterion |
| **Communication** | 15% | Clarity, collaboration, transparency | 0-10 per criterion |

### Seniority Mapping

| Score Range | Level | Characteristics |
|-------------|-------|----------------|
| 0-3.9 | Junior | Needs significant guidance, basic understanding |
| 4.0-5.9 | Mid | Solid fundamentals, can solve medium problems independently |
| 6.0-7.4 | Senior | Strong problem-solving, discusses tradeoffs, clean code |
| 7.5-8.4 | Staff | System thinking, mentors through code, optimizes proactively |
| 8.5-10.0 | Principal | Exceptional depth, novel approaches, teaches the interviewer |

### Adaptive Difficulty Algorithm

```python
def compute_next_difficulty(
    current_level: str,
    success_rate: float,
    time_remaining_pct: float,
    hints_used: int,
) -> str:
    """
    Adjusts problem difficulty based on candidate performance.

    - If success_rate > 0.8 and hints_used == 0: increase difficulty
    - If success_rate < 0.4: decrease difficulty
    - If time_remaining < 0.2: maintain current level
    - If hints_used >= 2: decrease difficulty
    """
    levels = ["easy", "medium", "hard", "expert"]
    idx = levels.index(current_level)

    if success_rate > 0.8 and hints_used == 0 and time_remaining_pct > 0.3:
        return levels[min(idx + 1, len(levels) - 1)]
    if success_rate < 0.4 or hints_used >= 2:
        return levels[max(idx - 1, 0)]
    return current_level
```

### Progressive Hint System

| Level | Hint Type | Example |
|-------|-----------|---------|
| 1 | Conceptual nudge | "Have you considered what data structure gives O(1) lookup?" |
| 2 | Partial guidance | "Try using a hash map to track what you've seen." |
| 3 | Near-solution | "Iterate once while maintaining a mapping of seen values to their indices." |

### Code Execution Sandbox Specification

| Language | Docker Image | Max Time | Memory |
|----------|-------------|----------|--------|
| Python | python:3.12-slim | 30s | 512MB |
| JavaScript | node:20-slim | 30s | 512MB |
| TypeScript | node:20-slim | 30s | 512MB |
| Java | eclipse-temurin:21-jre | 30s | 512MB |
| Go | golang:1.22-alpine | 30s | 512MB |
| C++ | gcc:13 | 30s | 512MB |

### Security Sandboxing
- `--network none` — no network access
- `--read-only` — read-only root filesystem
- `--tmpfs /tmp:size=100m` — writable temp space
- `--memory 512m` — memory limit
- `--cpus 0.5` — CPU limit
- `--cap-drop ALL` — drop all capabilities
- `--security-opt no-new-privileges` — prevent privilege escalation

## Recruiter Copilot Agent

### Capabilities
1. **Candidate Summary**: Generate 3-sentence candidate overview from profile + evaluations
2. **Ranking Explanation**: Explain why candidates are ranked in a specific order
3. **Candidate Comparison**: Side-by-side comparison of 2-3 candidates
4. **Action Recommendations**: Suggest next steps based on pipeline state
5. **Risk Identification**: Flag potential hiring risks (gap in employment, skill mismatch)
6. **Interview Question Generation**: Generate role-specific interview questions
7. **Report Generation**: Create hiring summary reports for stakeholders

### System Prompt
```
You are an expert AI recruiting assistant embedded in an enterprise recruitment platform.

Your role:
- Help recruiters make data-driven hiring decisions
- Provide clear, actionable insights
- Always explain your reasoning
- Flag potential risks and biases
- Respect candidate privacy and compliance rules
- Support diversity and inclusion goals

When summarizing candidates:
1. Highlight top 3 strengths relevant to the role
2. Note any concerns or gaps
3. Compare to role requirements
4. Suggest specific next steps
5. Estimate confidence in your assessment

Always cite data sources (resume, evaluation scores, interview feedback).
```

## AI Memory Architecture

### Short-Term Memory (Redis)
- Current conversation context
- Active session state
- Recent interactions (last 10 messages)
- TTL: session duration + 1 hour

### Long-Term Memory (pgvector)
- Candidate profiles with embeddings
- Historical evaluation results
- Interview transcripts
- Recruiter preferences and patterns
- Persistent across sessions

### Memory Types

| Type | Storage | Purpose | Retention |
|------|---------|---------|-----------|
| Session | Redis | Current conversation | Session + 1h |
| Candidate | pgvector | Candidate profile history | Permanent |
| Recruiter | pgvector | Recruiter behavior patterns | Permanent |
| Interview | pgvector | Past interview data | 2 years |
| Workflow | Redis | Automation patterns | 90 days |
| Knowledge | pgvector | RAG document store | Permanent |

## RAG Architecture

### Document Ingestion Pipeline
```
Document → Format Detection → Text Extraction → Chunking → Embedding → Vector Store
                                        ↓
                              Metadata Extraction
                                        ↓
                              Knowledge Graph Update
```

### Chunking Strategy
- **Resume**: By section (education, experience, skills)
- **Interview Transcripts**: By conversation turn
- **Policies**: By paragraph with overlap
- **Knowledge Base**: Recursive character splitting (1000 chars, 200 overlap)

### Retrieval Pipeline
1. Query embedding generation
2. Vector similarity search (top 20)
3. Metadata filtering (tenant, document type)
4. Cross-encoder reranking (top 10)
5. Context assembly (max 4000 tokens)
6. LLM generation with citations

### Semantic Caching
- Cache key: SHA-256 of query embedding
- Cache value: LLM response + metadata
- TTL: 24 hours
- Invalidation: On knowledge base updates

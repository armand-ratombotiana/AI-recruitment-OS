# Security Architecture — Enterprise-Grade Security

## Zero Trust Architecture

### Principles
1. **Never trust, always verify** — Every request is authenticated regardless of origin
2. **Least privilege** — Users and services get minimum required permissions
3. **Microsegmentation** — Services communicate through authenticated channels
4. **Continuous verification** — Tokens are validated on every request, sessions are monitored

### Service-to-Service Security
- mTLS via Istio service mesh
- SPIFFE identity for workloads
- JWT-based service authentication
- Network policies restricting pod-to-pod communication

## Authentication & Authorization

### JWT Token Structure

```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT",
    "kid": "key-2025-01"
  },
  "payload": {
    "sub": "user_uuid",
    "tenant_id": "tenant_uuid",
    "email": "user@example.com",
    "role": "recruiter",
    "permissions": ["candidates.read", "candidates.write", "evaluations.read"],
    "iat": 1705312200,
    "exp": 1705314000,
    "iss": "ai-ros",
    "jti": "token_uuid"
  }
}
```

### Token Lifecycle
1. **Access Token**: 30-minute expiry, short-lived, used for API calls
2. **Refresh Token**: 7-day expiry, rotated on use, stored in httpOnly cookie
3. **API Keys**: Long-lived, SHA-256 hashed, scoped permissions

### MFA Implementation
- **TOTP**: Google Authenticator compatible, 6-digit codes
- **SMS**: Via Twilio, 6-digit codes, 5-minute expiry
- **Email**: Via SendGrid, magic links or 6-digit codes

### SSO Integration
- **SAML 2.0**: SP-initiated SSO with major IdPs (Okta, Azure AD, OneLogin)
- **OIDC**: Authorization code flow with PKCE
- **OAuth 2.0**: For third-party integrations (LinkedIn, GitHub)

## RBAC & ABAC

### Role Hierarchy

```
Super Admin
├── Tenant Admin
│   ├── Recruiter
│   │   ├── Hiring Manager
│   │   └── Interviewer
│   └── Billing Admin
└── Candidate (external)
```

### Permission Matrix

| Resource | Super Admin | Tenant Admin | Recruiter | Hiring Manager | Interviewer | Candidate |
|----------|------------|-------------|-----------|----------------|-------------|-----------|
| Tenants | CRUD | R | - | - | - | - |
| Users | CRUD | CRU | R | R | R | - |
| Candidates | CRUD | CRUD | CRUD | R | R* | R* |
| Jobs | CRUD | CRUD | CRUD | CRUD | R | R |
| Resumes | CRUD | CRUD | CRUD | R | R* | R* |
| Interviews | CRUD | CRUD | CRUD | RU | RU | R* |
| Evaluations | CRUD | CRUD | CR | R | R | R* |
| Workflows | CRUD | CRUD | CRU | R | - | - |
| Analytics | CRUD | CRUD | R | R | - | - |
| Billing | CRUD | RU | - | - | - | - |
| Settings | CRUD | RU | - | - | - | - |

*R = own data only

### ABAC Policies

```python
# Example ABAC policy for candidate access
class CandidateAccessPolicy:
    def evaluate(self, user, resource, action) -> bool:
        # Tenant isolation
        if user.tenant_id != resource.tenant_id:
            return False

        # Role-based
        if user.role == "recruiter":
            return True
        if user.role == "hiring_manager":
            return action in ("read", "update")
        if user.role == "interviewer":
            return action == "read" and resource.has_interview_with(user.id)

        return False
```

## Encryption

### At Rest
- **Database**: AES-256 encryption via AWS RDS
- **S3**: SSE-S3 or SSE-KMS encryption
- **Backups**: Encrypted with separate KMS key
- **Secrets**: HashiCorp Vault with auto-rotation

### In Transit
- **External**: TLS 1.3 enforced (HSTS header)
- **Internal**: mTLS via Istio service mesh
- **Database**: SSL required for connections

### Column-Level Encryption
```python
# Sensitive fields encrypted at application level
class Candidate(SQLModel):
    ssn_encrypted: str | None = None  # AES-256-GCM
    phone_encrypted: str | None = None
    salary_history_encrypted: str | None = None
```

## AI Security

### Prompt Injection Prevention
1. Input sanitization before LLM calls
2. System prompt isolation from user input
3. Output validation and filtering
4. Rate limiting on AI endpoints
5. Content filtering on inputs and outputs

### Output Sanitization
```python
def sanitize_ai_output(output: str) -> str:
    # Remove potential PII from AI responses
    output = re.sub(r'\b\d{3}-\d{2}-\d{4}\b', '[SSN_REDACTED]', output)
    output = re.sub(r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b', '[CARD_REDACTED]', output)
    # Remove code injection attempts
    output = re.sub(r'```.*?```', '[CODE_BLOCK]', output, flags=re.DOTALL)
    return output
```

### AI Safety Guardrails
- Maximum token limits per request
- Model-specific safety filters
- Human-in-the-loop for critical decisions
- Audit logging for all AI interactions
- Hallucination detection and flagging

## Data Protection

### PII Detection & Masking
```python
PII_PATTERNS = {
    "email": r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',
    "phone": r'\+?[\d\s\-\(\)]{10,}',
    "ssn": r'\b\d{3}-\d{2}-\d{4}\b',
    "credit_card": r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b',
}
```

### Tenant Data Isolation
1. **Schema-per-tenant**: Each tenant gets a PostgreSQL schema
2. **Row-level security**: PostgreSQL RLS policies on all tables
3. **Application-level**: Tenant ID injected into every query
4. **Storage isolation**: S3 prefix per tenant
5. **AI memory isolation**: Separate embedding namespaces per tenant
6. **Event isolation**: Kafka headers carry tenant ID

## Compliance Implementation

### GDPR
- **Consent Management**: Explicit consent tracking per data processing purpose
- **Right to Erasure**: Automated data deletion pipeline
- **Data Portability**: Export candidate data in JSON/CSV
- **Data Processing Agreements**: Template DPA for all tenants
- **Breach Notification**: Automated 72-hour notification pipeline

### SOC2
- **Access Reviews**: Quarterly access certification
- **Change Management**: All deployments logged and approved
- **Incident Response**: Automated detection and response playbooks
- **Vendor Management**: Third-party risk assessment
- **Monitoring**: Continuous compliance monitoring

### ISO27001
- **Risk Assessment**: Annual risk assessment and treatment
- **Security Controls**: Implemented per ISO27002
- **Internal Audits**: Semi-annual internal audits
- **Management Review**: Annual management review

## Audit & Monitoring

### Audit Trail Schema
Every write operation generates an audit entry:
```json
{
  "id": "uuid",
  "tenant_id": "tenant_uuid",
  "actor_id": "user_uuid",
  "actor_type": "user",
  "action": "candidates.update",
  "resource_type": "candidate",
  "resource_id": "candidate_uuid",
  "changes": {
    "status": {"old": "screening", "new": "interviewing"}
  },
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Security Event Monitoring
- Failed login attempts
- Privilege escalation attempts
- Unusual API usage patterns
- Cross-tenant access attempts
- AI prompt injection attempts
- Data export anomalies
- Configuration changes

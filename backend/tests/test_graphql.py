"""Tests for GraphQL API — queries, mutations, auth, tenant isolation."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from shared.core.config import Settings
from shared.core.security import create_access_token, hash_password
from shared.core.models.identity import User, UserRole, UserStatus
from shared.core.models.candidate import Candidate, CandidateStatus
from shared.core.models.recruitment import Job, JobStatus, JobType, Application, ApplicationStatus
from shared.core.models.interview import Interview, InterviewStatus


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


TENANT_A = str(uuid.uuid4())
TENANT_B = str(uuid.uuid4())
USER_A_ID = str(uuid.uuid4())
USER_B_ID = str(uuid.uuid4())


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def gql_engine():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def gql_session(gql_engine) -> AsyncGenerator[AsyncSession, None]:
    factory = async_sessionmaker(gql_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def seeded_db(gql_engine):
    factory = async_sessionmaker(gql_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        user_a = User(
            id=USER_A_ID, tenant_id=TENANT_A, email="alice@test.com",
            full_name="Alice", hashed_password=hash_password("pass1234!"),
            role=UserRole.RECRUITER, status=UserStatus.ACTIVE,
        )
        user_b = User(
            id=USER_B_ID, tenant_id=TENANT_B, email="bob@test.com",
            full_name="Bob", hashed_password=hash_password("pass1234!"),
            role=UserRole.RECRUITER, status=UserStatus.ACTIVE,
        )
        session.add_all([user_a, user_b])

        cand_1 = Candidate(
            id=str(uuid.uuid4()), tenant_id=TENANT_A, email="c1@test.com",
            full_name="Candidate One", status=CandidateStatus.NEW, location="Paris",
            created_at=_now(), updated_at=_now(),
        )
        cand_2 = Candidate(
            id=str(uuid.uuid4()), tenant_id=TENANT_A, email="c2@test.com",
            full_name="Candidate Two", status=CandidateStatus.SCREENING, location="London",
            created_at=_now(), updated_at=_now(),
        )
        cand_b = Candidate(
            id=str(uuid.uuid4()), tenant_id=TENANT_B, email="cb@test.com",
            full_name="Tenant B Candidate", status=CandidateStatus.NEW,
            created_at=_now(), updated_at=_now(),
        )
        session.add_all([cand_1, cand_2, cand_b])

        job_1 = Job(
            id=str(uuid.uuid4()), tenant_id=TENANT_A, title="Backend Engineer",
            description="Build APIs", status=JobStatus.OPEN, job_type=JobType.FULL_TIME,
            location="Paris", required_skills='["python"]',
            created_at=_now(), updated_at=_now(),
        )
        job_2 = Job(
            id=str(uuid.uuid4()), tenant_id=TENANT_A, title="Frontend Dev",
            description="Build UIs", status=JobStatus.DRAFT, job_type=JobType.FULL_TIME,
            created_at=_now(), updated_at=_now(),
        )
        session.add_all([job_1, job_2])
        await session.commit()

        yield factory


@pytest_asyncio.fixture(scope="function")
async def gql_client(seeded_db):
    from apps.graphql_api.main import schema, make_context_getter
    from strawberry.fastapi import GraphQLRouter
    from fastapi import FastAPI

    test_router = GraphQLRouter(
        schema, path="/graphql",
        context_getter=make_context_getter(session_factory=seeded_db),
    )
    test_app = FastAPI()
    test_app.include_router(test_router, prefix="/graphql")

    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _token(user_id: str, tenant_id: str) -> str:
    return create_access_token({"sub": user_id, "tenant_id": tenant_id, "email": "test@test.com", "role": "recruiter"})


@pytest.mark.asyncio
async def test_query_candidates(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)
    resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": "{ candidates { id fullName email status } }"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "errors" not in data
    candidates = data["data"]["candidates"]
    assert len(candidates) == 2


@pytest.mark.asyncio
async def test_query_candidates_pagination(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)
    resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": '{ candidates(offset: 0, limit: 1) { id } }'},
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    assert len(data["data"]["candidates"]) == 1


@pytest.mark.asyncio
async def test_query_candidates_filter_status(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)
    resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": '{ candidates(status: "screening") { id fullName } }'},
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    candidates = data["data"]["candidates"]
    assert len(candidates) == 1
    assert candidates[0]["fullName"] == "Candidate Two"


@pytest.mark.asyncio
async def test_query_candidates_filter_location(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)
    resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": '{ candidates(location: "Paris") { id } }'},
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    assert len(data["data"]["candidates"]) == 1


@pytest.mark.asyncio
async def test_query_candidate_by_id(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)
    resp_list = await gql_client.post(
        "/graphql/graphql",
        json={"query": "{ candidates { id } }"},
        headers={"Authorization": f"Bearer {token}"},
    )
    cid = resp_list.json()["data"]["candidates"][0]["id"]

    resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": f'{{ candidate(id: "{cid}") {{ id fullName email }} }}'},
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    assert data["data"]["candidate"]["id"] == cid


@pytest.mark.asyncio
async def test_query_jobs(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)
    resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": "{ jobs { id title status } }"},
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    assert len(data["data"]["jobs"]) == 2


@pytest.mark.asyncio
async def test_query_jobs_filter_status(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)
    resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": '{ jobs(status: "open") { id title } }'},
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    jobs = data["data"]["jobs"]
    assert len(jobs) == 1
    assert jobs[0]["title"] == "Backend Engineer"


@pytest.mark.asyncio
async def test_query_me(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)
    resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": "{ me { id email fullName } }"},
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    assert data["data"]["me"]["id"] == USER_A_ID
    assert data["data"]["me"]["email"] == "alice@test.com"


@pytest.mark.asyncio
async def test_query_me_unauthenticated(gql_client, seeded_db):
    resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": "{ me { id } }"},
    )
    data = resp.json()
    assert data["data"]["me"] is None


@pytest.mark.asyncio
async def test_tenant_isolation_candidates(gql_client, seeded_db):
    token_b = _token(USER_B_ID, TENANT_B)
    resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": "{ candidates { id fullName } }"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    data = resp.json()
    candidates = data["data"]["candidates"]
    assert len(candidates) == 1
    assert candidates[0]["fullName"] == "Tenant B Candidate"


@pytest.mark.asyncio
async def test_tenant_isolation_jobs(gql_client, seeded_db):
    token_b = _token(USER_B_ID, TENANT_B)
    resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": "{ jobs { id } }"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    data = resp.json()
    assert len(data["data"]["jobs"]) == 0


@pytest.mark.asyncio
async def test_mutation_create_candidate(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)
    resp = await gql_client.post(
        "/graphql/graphql",
        json={
            "query": """
                mutation {
                    createCandidate(input: {
                        email: "new@test.com",
                        fullName: "New Candidate",
                        location: "Berlin"
                    }) {
                        id email fullName location status
                    }
                }
            """,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    assert "errors" not in data
    c = data["data"]["createCandidate"]
    assert c["email"] == "new@test.com"
    assert c["fullName"] == "New Candidate"
    assert c["location"] == "Berlin"
    assert c["status"] == "new"


@pytest.mark.asyncio
async def test_mutation_update_candidate(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)
    list_resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": "{ candidates { id } }"},
        headers={"Authorization": f"Bearer {token}"},
    )
    cid = list_resp.json()["data"]["candidates"][0]["id"]

    resp = await gql_client.post(
        "/graphql/graphql",
        json={
            "query": f"""
                mutation {{
                    updateCandidate(input: {{
                        id: "{cid}",
                        fullName: "Updated Name",
                        status: "hired"
                    }}) {{
                        id fullName status
                    }}
                }}
            """,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    assert data["data"]["updateCandidate"]["fullName"] == "Updated Name"
    assert data["data"]["updateCandidate"]["status"] == "hired"


@pytest.mark.asyncio
async def test_mutation_create_job(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)
    resp = await gql_client.post(
        "/graphql/graphql",
        json={
            "query": """
                mutation {
                    createJob(input: {
                        title: "DevOps Engineer",
                        description: "CI/CD pipelines",
                        location: "Remote",
                        jobType: "contract"
                    }) {
                        id title description location jobType status
                    }
                }
            """,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    assert "errors" not in data
    j = data["data"]["createJob"]
    assert j["title"] == "DevOps Engineer"
    assert j["jobType"] == "contract"
    assert j["status"] == "draft"


@pytest.mark.asyncio
async def test_mutation_update_job(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)
    list_resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": "{ jobs { id } }"},
        headers={"Authorization": f"Bearer {token}"},
    )
    jid = list_resp.json()["data"]["jobs"][0]["id"]

    resp = await gql_client.post(
        "/graphql/graphql",
        json={
            "query": f"""
                mutation {{
                    updateJob(input: {{
                        id: "{jid}",
                        title: "Senior Backend Engineer",
                        status: "closed"
                    }}) {{
                        id title status
                    }}
                }}
            """,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    assert data["data"]["updateJob"]["title"] == "Senior Backend Engineer"
    assert data["data"]["updateJob"]["status"] == "closed"


@pytest.mark.asyncio
async def test_mutation_schedule_interview(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)

    list_resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": "{ jobs { id } candidates { id } }"},
        headers={"Authorization": f"Bearer {token}"},
    )
    jdata = list_resp.json()["data"]
    jid = jdata["jobs"][0]["id"]
    cid = jdata["candidates"][0]["id"]

    app_resp = await gql_client.post(
        "/graphql/graphql",
        json={
            "query": f"""
                mutation {{
                    createApplication(input: {{
                        candidateId: "{cid}",
                        jobId: "{jid}"
                    }}) {{
                        id candidateId jobId status
                    }}
                }}
            """,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    app_id = app_resp.json()["data"]["createApplication"]["id"]

    resp = await gql_client.post(
        "/graphql/graphql",
        json={
            "query": f"""
                mutation {{
                    scheduleInterview(input: {{
                        applicationId: "{app_id}",
                        candidateId: "{cid}",
                        jobId: "{jid}",
                        interviewType: "technical",
                        durationMinutes: 45
                    }}) {{
                        id interviewType status durationMinutes
                    }}
                }}
            """,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    assert "errors" not in data
    iv = data["data"]["scheduleInterview"]
    assert iv["interviewType"] == "technical"
    assert iv["status"] == "scheduled"
    assert iv["durationMinutes"] == 45


@pytest.mark.asyncio
async def test_mutation_update_interview_status(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)

    list_resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": "{ jobs { id } candidates { id } }"},
        headers={"Authorization": f"Bearer {token}"},
    )
    jdata = list_resp.json()["data"]
    jid = jdata["jobs"][0]["id"]
    cid = jdata["candidates"][0]["id"]

    app_resp = await gql_client.post(
        "/graphql/graphql",
        json={
            "query": f"""
                mutation {{
                    createApplication(input: {{
                        candidateId: "{cid}",
                        jobId: "{jid}"
                    }}) {{
                        id
                    }}
                }}
            """,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    app_id = app_resp.json()["data"]["createApplication"]["id"]

    sched_resp = await gql_client.post(
        "/graphql/graphql",
        json={
            "query": f"""
                mutation {{
                    scheduleInterview(input: {{
                        applicationId: "{app_id}",
                        candidateId: "{cid}",
                        jobId: "{jid}",
                        interviewType: "hr_screening"
                    }}) {{
                        id
                    }}
                }}
            """,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    iv_id = sched_resp.json()["data"]["scheduleInterview"]["id"]

    resp = await gql_client.post(
        "/graphql/graphql",
        json={
            "query": f"""
                mutation {{
                    updateInterviewStatus(input: {{
                        id: "{iv_id}",
                        status: "completed"
                    }}) {{
                        id status
                    }}
                }}
            """,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    assert data["data"]["updateInterviewStatus"]["status"] == "completed"


@pytest.mark.asyncio
async def test_mutation_create_application(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)
    list_resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": "{ jobs { id } candidates { id } }"},
        headers={"Authorization": f"Bearer {token}"},
    )
    jdata = list_resp.json()["data"]
    jid = jdata["jobs"][0]["id"]
    cid = jdata["candidates"][0]["id"]

    resp = await gql_client.post(
        "/graphql/graphql",
        json={
            "query": f"""
                mutation {{
                    createApplication(input: {{
                        candidateId: "{cid}",
                        jobId: "{jid}"
                    }}) {{
                        id candidateId jobId status currentStage
                    }}
                }}
            """,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    assert "errors" not in data
    app = data["data"]["createApplication"]
    assert app["candidateId"] == cid
    assert app["jobId"] == jid
    assert app["status"] == "applied"


@pytest.mark.asyncio
async def test_mutation_update_application_status(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)
    list_resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": "{ jobs { id } candidates { id } }"},
        headers={"Authorization": f"Bearer {token}"},
    )
    jdata = list_resp.json()["data"]
    jid = jdata["jobs"][0]["id"]
    cid = jdata["candidates"][0]["id"]

    app_resp = await gql_client.post(
        "/graphql/graphql",
        json={
            "query": f"""
                mutation {{
                    createApplication(input: {{
                        candidateId: "{cid}",
                        jobId: "{jid}"
                    }}) {{
                        id
                    }}
                }}
            """,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    app_id = app_resp.json()["data"]["createApplication"]["id"]

    resp = await gql_client.post(
        "/graphql/graphql",
        json={
            "query": f"""
                mutation {{
                    updateApplicationStatus(input: {{
                        id: "{app_id}",
                        status: "screening",
                        currentStage: "screening"
                    }}) {{
                        id status currentStage
                    }}
                }}
            """,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    assert data["data"]["updateApplicationStatus"]["status"] == "screening"
    assert data["data"]["updateApplicationStatus"]["currentStage"] == "screening"


@pytest.mark.asyncio
async def test_query_users(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)
    resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": "{ users { id email fullName role } }"},
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    users = data["data"]["users"]
    assert len(users) == 1
    assert users[0]["email"] == "alice@test.com"


@pytest.mark.asyncio
async def test_query_candidate_not_found(gql_client, seeded_db):
    token = _token(USER_A_ID, TENANT_A)
    resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": f'{{ candidate(id: "{str(uuid.uuid4())}") {{ id }} }}'},
        headers={"Authorization": f"Bearer {token}"},
    )
    data = resp.json()
    assert data["data"]["candidate"] is None


@pytest.mark.asyncio
async def test_tenant_isolation_candidate_by_id(gql_client, seeded_db):
    token_a = _token(USER_A_ID, TENANT_A)
    list_resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": "{ candidates { id } }"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    cid = list_resp.json()["data"]["candidates"][0]["id"]

    token_b = _token(USER_B_ID, TENANT_B)
    resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": f'{{ candidate(id: "{cid}") {{ id }} }}'},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    data = resp.json()
    assert data["data"]["candidate"] is None


@pytest.mark.asyncio
async def test_invalid_token_returns_null_me(gql_client, seeded_db):
    resp = await gql_client.post(
        "/graphql/graphql",
        json={"query": "{ me { id } }"},
        headers={"Authorization": "Bearer invalid.token.here"},
    )
    data = resp.json()
    assert data["data"]["me"] is None

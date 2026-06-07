"""Tag domain — tenant-scoped label definitions and their application to entities.

A :class:`Tag` is a tenant-scoped, named label with an optional color that can be
applied to a candidate, a job, or both (controlled by ``entity_type``).

A :class:`TagApplication` is the join row that wires a tag to a concrete entity
instance (a candidate or a job).  Tracking applications as their own table lets
us:

* List the tags attached to a given candidate / job in O(1) lookups.
* Compute the "popular tags" leaderboard with a single ``GROUP BY`` aggregation.
* Keep the tag definition and the tag ↔ entity relationship on independent
  lifecycles (a tag can exist before it is applied; deleting a tag cleans up
  the join rows).

The schema is intentionally narrow: any richer tag metadata (description,
icon, owner, etc.) can be added later without touching the application table.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field
from sqlmodel import SQLModel, Field as SQLField


class TagEntityType(str, Enum):
    """Which entity kinds a tag is allowed to be attached to.

    * ``candidate`` — usable on candidate rows only.
    * ``job`` — usable on job rows only.
    * ``all`` — usable on both candidates and jobs (the common case).
    """

    CANDIDATE = "candidate"
    JOB = "job"
    ALL = "all"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _new_id() -> str:
    return str(uuid.uuid4())


class Tag(SQLModel, table=True):
    """Tenant-scoped tag definition.

    ``name`` is stored lower-cased for uniqueness checks; the original
    ``display_name`` field is preserved for the API so the UI can render the
    casing the user typed.
    """

    __tablename__ = "tags"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    name: str = SQLField(max_length=100, nullable=False, index=True)
    display_name: str = SQLField(max_length=100, nullable=False)
    color: str | None = SQLField(default=None, max_length=16, description="Hex color e.g. #3B82F6")
    entity_type: TagEntityType = SQLField(
        default=TagEntityType.ALL,
        index=True,
        description="candidate | job | all",
    )
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False, index=True)
    updated_at: datetime = SQLField(default_factory=_utcnow, nullable=False)


class TagApplication(SQLModel, table=True):
    """Join row connecting a :class:`Tag` to a concrete entity (candidate or job).

    ``entity_type`` mirrors the tag's allowed entity types at the moment of
    application so we can filter "tags on a candidate" without joining back
    to the tags table.  The pair (``entity_type``, ``entity_id``) is indexed
    for fast per-entity listing.
    """

    __tablename__ = "tag_applications"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    tag_id: str = SQLField(index=True, nullable=False)
    entity_type: str = SQLField(index=True, nullable=False, max_length=32)
    entity_id: str = SQLField(index=True, nullable=False, max_length=64)
    applied_at: datetime = SQLField(default_factory=_utcnow, nullable=False, index=True)


# ── API schemas ───────────────────────────────────────────────────────────────


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100, description="Tag name (case-insensitive)")
    color: str | None = Field(default=None, max_length=16, description="Hex color e.g. #3B82F6")
    entity_type: TagEntityType = Field(
        default=TagEntityType.ALL,
        description="candidate | job | all",
    )


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    color: str | None = Field(default=None, max_length=16)
    entity_type: TagEntityType | None = Field(default=None)


class TagRead(BaseModel):
    id: str
    tenant_id: str
    name: str
    display_name: str
    color: str | None = None
    entity_type: TagEntityType
    usage_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TagListResponse(BaseModel):
    data: list[TagRead]
    total: int
    page: int
    page_size: int


class TagCreateResponse(BaseModel):
    id: str
    name: str
    display_name: str
    color: str | None = None
    entity_type: TagEntityType
    created: bool = True


class TagUpdateResponse(BaseModel):
    id: str
    updated: bool = True


class TagDeleteResponse(BaseModel):
    id: str
    deleted: bool = True


class TagApplyRequest(BaseModel):
    """Bulk apply / remove payload for the tag ↔ entity endpoints."""

    entity_type: str = Field(..., description="candidate | job")
    entity_ids: list[str] = Field(default_factory=list, description="Concrete entity ids to apply the tag to")


class TagApplyResponse(BaseModel):
    tag_id: str
    entity_type: str
    applied: int
    skipped: int
    application_ids: list[str] = Field(default_factory=list)


class TagRemoveRequest(BaseModel):
    entity_type: str = Field(..., description="candidate | job")
    entity_ids: list[str] = Field(default_factory=list)


class TagRemoveResponse(BaseModel):
    tag_id: str
    entity_type: str
    removed: int


class PopularTagItem(BaseModel):
    id: str
    name: str
    display_name: str
    color: str | None = None
    entity_type: TagEntityType
    usage_count: int


class PopularTagsResponse(BaseModel):
    data: list[PopularTagItem]
    total: int


# ── Candidate / Job ↔ tag schemas ─────────────────────────────────────────────


class EntityTagRead(BaseModel):
    id: str
    name: str
    display_name: str
    color: str | None = None
    entity_type: TagEntityType
    applied_at: datetime

    model_config = {"from_attributes": True}


class EntityTagListResponse(BaseModel):
    entity_type: str
    entity_id: str
    data: list[EntityTagRead]
    total: int


class AddEntityTagRequest(BaseModel):
    """Payload for adding a single tag to an entity.

    Either ``tag_id`` (attach an existing tag) or ``name`` (create-on-attach
    for the common "add a new label inline" UI flow) must be provided.
    """

    tag_id: str | None = Field(default=None, description="Existing tag id to attach")
    name: str | None = Field(default=None, min_length=1, max_length=100, description="Create a new tag with this name")
    color: str | None = Field(default=None, max_length=16)


class AddEntityTagResponse(BaseModel):
    tag: EntityTagRead
    created: bool = False
    applied: bool = True

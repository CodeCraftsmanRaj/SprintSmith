from uuid import UUID

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2_000)
    top_k: int = Field(default=10, ge=1, le=100)


class SearchResult(BaseModel):
    document_id: str
    chunk_id: str
    text: str
    score: float
    citation: str


class SearchResponse(BaseModel):
    query: str
    mode: str
    results: list[SearchResult]


class DocumentResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    filename: str
    content_type: str
    status: str
    checksum: str


class JobResponse(BaseModel):
    id: UUID
    document_id: UUID
    status: str
    attempts: int
    error: str | None = None


class EntityResponse(BaseModel):
    id: UUID
    name: str
    entity_type: str
    properties: dict[str, object]


class RelationshipResponse(BaseModel):
    id: UUID
    subject: str
    predicate: str
    object: str
    confidence: float
    source_chunk_id: UUID | None = None
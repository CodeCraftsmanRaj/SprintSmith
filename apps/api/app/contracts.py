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
from pydantic import BaseModel, Field, ConfigDict

class EvaluationBaselineCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str | None = None
    description: str | None = None
    created_at: str | None = None
    updated_at: str | None = None

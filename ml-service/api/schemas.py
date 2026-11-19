from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

RelevanceLabel = Literal["RELEVANT", "PARTIALLY_RELEVANT", "IRRELEVANT", "CANNOT_DETERMINE"]
EvidenceLabel = Literal["ENTAILMENT", "NEUTRAL", "CONTRADICTION"]
Verdict = Literal[
    "SUPPORTED",
    "PARTIALLY_SUPPORTED",
    "CONTRADICTED",
    "INSUFFICIENT_EVIDENCE",
    "UNVERIFIED",
]
Relationship = Literal["SUPPORTS", "CONTRADICTS", "NEUTRAL"]


class Passage(BaseModel):
    id: str
    page: int
    section: str = "Body"
    text: str = Field(min_length=1, max_length=12000)
    order: int | None = None

    @field_validator("id")
    @classmethod
    def safe_id(cls, value: str) -> str:
        if not value or len(value) > 80:
            raise ValueError("passage id is required and must be <= 80 characters")
        return value


class RelevanceRequest(BaseModel):
    statement: str = Field(min_length=3, max_length=4000)
    paper_title: str = Field(default="", max_length=1000)
    paper_abstract: str = Field(default="", max_length=12000)
    paper_keywords: list[str] = Field(default_factory=list, max_length=30)


class EvidenceRequest(BaseModel):
    statement: str = Field(min_length=3, max_length=4000)
    passages: list[Passage] = Field(default_factory=list, max_length=80)


class RetrieveRequest(BaseModel):
    statement: str = Field(min_length=3, max_length=4000)
    passages: list[Passage] = Field(min_length=1, max_length=120)
    top_k: int = Field(default=12, ge=1, le=40)


class RelevanceResponse(BaseModel):
    label: RelevanceLabel
    confidence: float
    probabilities: dict[str, float]
    confidence_is_calibrated: bool
    model_version: str


class EvidenceSelection(BaseModel):
    source_id: str
    page: int | None = None
    section: str | None = None
    quote: str
    relationship: Relationship
    confidence: float


class EvidenceResponse(BaseModel):
    verdict: Verdict
    confidence: float | None
    explanation: str
    evidence: list[EvidenceSelection]
    limitations: list[str]
    human_review_required: bool
    model_version: str | None
    probabilities: dict[str, float]


class RetrieveResponse(BaseModel):
    chunks: list[dict]
    retrieval_model: str
    method: str


class AdminStatusResponse(BaseModel):
    health: dict
    registry: dict
    jobs: list[dict]
    datasets: dict
    evaluations: list[dict] = Field(default_factory=list)


class DatasetUploadRequest(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    content: str = Field(min_length=1, max_length=25_000_000)


class ValidateDatasetRequest(BaseModel):
    kind: Literal["relevance", "evidence"]
    file: str = Field(min_length=3, max_length=240)
    allow_unreviewed: bool = False


class TrainRequest(BaseModel):
    kind: Literal["relevance", "evidence"]
    dataset_dir: str | None = None


class EvaluateRequest(BaseModel):
    kind: Literal["relevance", "evidence"]
    model_version: str | None = None


class DeployRequest(BaseModel):
    kind: Literal["relevance", "evidence"]
    version: str


class RollbackRequest(BaseModel):
    kind: Literal["relevance", "evidence"]

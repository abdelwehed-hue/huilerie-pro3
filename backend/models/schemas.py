from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

Role = Literal["admin", "worker"]
Grade = Literal["extra_vierge", "vierge", "lampante"]


class User(BaseModel):
    id: str
    username: str
    full_name: str
    role: Role
    active: bool
    created_at: datetime


class LoginIn(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=40)
    full_name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=4, max_length=100)
    role: Role = "worker"


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    role: Optional[Role] = None
    active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=4, max_length=100)


class LabAnalysis(BaseModel):
    id: str
    load_id: str
    code: str
    client_name: str
    acidity: float
    peroxide: Optional[float] = None
    k232: Optional[float] = None
    k270: Optional[float] = None
    oil_content_pct: Optional[float] = None
    classification: Grade
    notes: str = ""
    created_at: datetime
    created_by: str


class LabCreate(BaseModel):
    code: str = Field(min_length=1)
    acidity: float = Field(ge=0, le=100)
    peroxide: Optional[float] = Field(default=None, ge=0)
    k232: Optional[float] = Field(default=None, ge=0)
    k270: Optional[float] = Field(default=None, ge=0)
    oil_content_pct: Optional[float] = Field(default=None, ge=0, le=100)
    classification: Optional[Grade] = None
    notes: str = ""


class Load(BaseModel):
    id: str
    code: str
    client_name: str
    phone: str
    olive_kg: float
    oil_kg: Optional[float] = None
    yield_pct: Optional[float] = None
    status: Literal["pending", "done"]
    day: str
    created_at: datetime
    created_by: str
    # admin-only fields — None for workers
    price_per_kg: Optional[float] = None
    amount: Optional[float] = None
    lab: Optional[LabAnalysis] = None


class LoadCreate(BaseModel):
    client_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=4, max_length=30)
    olive_kg: float = Field(gt=0)


class OilUpdate(BaseModel):
    oil_kg: float = Field(ge=0)


class DailyPoint(BaseModel):
    day: str
    olive_kg: float
    oil_kg: float
    revenue: Optional[float] = None


class Stats(BaseModel):
    today: str
    loads_today: int
    loads_total: int
    pending: int
    olive_kg_today: float
    oil_kg_today: float
    olive_kg_total: float
    oil_kg_total: float
    avg_yield: Optional[float] = None
    revenue_today: Optional[float] = None
    revenue_total: Optional[float] = None
    daily: list[DailyPoint]


class AppSettings(BaseModel):
    price_per_kg: float = Field(ge=0)

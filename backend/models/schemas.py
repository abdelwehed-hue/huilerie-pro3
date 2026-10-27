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
    username: Optional[str] = Field(default=None, min_length=2, max_length=40)
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
    oil_type: Optional[str] = None
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
    oil_type: Optional[str] = Field(default=None, max_length=60)
    notes: str = ""


class Load(BaseModel):
    id: str
    code: str
    client_name: str
    phone: str
    olive_kg: float
    oil_kg: Optional[float] = None
    yield_pct: Optional[float] = None
    status: Literal["pending", "pressing", "done", "delivered", "cancelled"]
    day: str
    season: str = ""
    created_at: datetime
    created_by: str
    created_by_name: Optional[str] = None
    bags: Optional[int] = None
    variety: Optional[str] = None
    notes: Optional[str] = None
    oil_ready_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    delivered_by: Optional[str] = None
    reminder_sent_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancelled_by: Optional[str] = None
    # admin-only fields — None for workers
    price_per_kg: Optional[float] = None
    amount: Optional[float] = None
    lab: Optional[LabAnalysis] = None


class LoadCreate(BaseModel):
    client_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=4, max_length=30)
    olive_kg: float = Field(gt=0, le=1_000_000)
    bags: Optional[int] = Field(default=None, ge=0, le=100_000)
    variety: Optional[str] = Field(default=None, max_length=60)
    notes: Optional[str] = Field(default=None, max_length=500)
    initial_status: Literal["pending", "pressing"] = "pending"


class StatusUpdate(BaseModel):
    status: Literal["pending", "pressing", "done", "delivered"]


class SeasonInfo(BaseModel):
    current: str
    active: str
    auto: bool
    available: list[str]


class SeasonSet(BaseModel):
    season: str = Field(default="", pattern=r"^(\d{4}-\d{4})?$")  # "" = automatic (by date)


class Varieties(BaseModel):
    varieties: list[str] = Field(max_length=100)


class ClientCreate(BaseModel):
    client_name: str = Field(min_length=2, max_length=100)
    phone: str = Field(min_length=4, max_length=30)


class CancelBody(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


class OilUpdate(BaseModel):
    oil_kg: float = Field(ge=0)


class DailyPoint(BaseModel):
    day: str
    olive_kg: float
    oil_kg: float
    revenue: Optional[float] = None


class Stats(BaseModel):
    today: str
    season: str = ""
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


class MillInfo(BaseModel):
    mill_name: str = ""
    mill_address: str = ""
    mill_phone: str = ""
    mill_logo: str = Field(default="", max_length=700_000)  # data URL (image resized client-side)


DEFAULT_SMS_ARRIVAL = (
    "{mill}: Bonjour {name}, votre code: {code} - Olives: {olive_kg} kg.\n"
    "{mill}: مرحبا {name}، الكود متاعك: {code} - الزيتون: {olive_kg} كغ."
)
DEFAULT_SMS_READY = (
    "{mill}: {name}, votre huile est prête: {oil_kg} kg (code {code}).\n"
    "{mill}: {name}، الزيت متاعك جاهز: {oil_kg} كغ (الكود {code})."
)
DEFAULT_SMS_REMINDER = (
    "{mill}: {name}, rappel: votre huile ({oil_kg} kg, code {code}) vous attend.\n"
    "{mill}: {name}، تذكير: الزيت متاعك ({oil_kg} كغ، الكود {code}) في انتظارك."
)


class TwilioConfigOut(BaseModel):
    account_sid: str = ""
    from_number: str = ""
    messaging_service_sid: str = ""
    has_token: bool = False
    source: Literal["db", "env", "none"] = "none"
    mode: Literal["simulated", "live"] = "simulated"


class TwilioConfigIn(BaseModel):
    account_sid: str = Field(min_length=10, max_length=64)
    auth_token: str = Field(default="", max_length=128)  # empty = keep stored token
    from_number: str = Field(default="", max_length=30)
    messaging_service_sid: str = Field(default="", max_length=64)


class SmsTestIn(BaseModel):
    phone: str = Field(min_length=4, max_length=30)


class SmsTestResult(BaseModel):
    status: Literal["simulated", "sent", "failed", "disabled"]
    error: Optional[str] = None
    to_number: str
    mode: Literal["simulated", "live"]


class ReminderRunResult(BaseModel):
    sent: int


class AppSettings(MillInfo):
    price_per_kg: float = Field(ge=0)
    login_image: str = Field(default="", max_length=700_000)
    tv_image: str = Field(default="", max_length=700_000)
    sms_enabled: bool = True
    sms_arrival_template: str = Field(default=DEFAULT_SMS_ARRIVAL, max_length=600)
    sms_ready_template: str = Field(default=DEFAULT_SMS_READY, max_length=600)
    sms_reminder_template: str = Field(default=DEFAULT_SMS_REMINDER, max_length=600)


class SmsStatus(BaseModel):
    mode: Literal["simulated", "live"]
    enabled: bool


class SmsLog(BaseModel):
    id: str
    load_id: str
    code: str
    client_name: str
    phone: str
    kind: Literal["arrival", "ready", "reminder", "test"]
    message: str
    status: Literal["simulated", "sent", "failed", "disabled"]
    to_number: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime


class WorkerRow(BaseModel):
    day: str
    username: str
    full_name: str
    loads: int
    olive_kg: float
    oil_kg: float
    revenue: float


class WorkerReport(BaseModel):
    start: str
    end: str
    rows: list[WorkerRow]
    totals: list[WorkerRow]


class ReportRow(BaseModel):
    period: str
    loads: int
    olive_kg: float
    oil_kg: float
    revenue: float


class RevenueReport(BaseModel):
    period: Literal["daily", "monthly"]
    start: str
    end: str
    rows: list[ReportRow]
    total: ReportRow


class ClientUpdate(BaseModel):
    client_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=4, max_length=30)


class ClientDeleteResult(BaseModel):
    deleted: int


class ClientSummary(BaseModel):
    phone: str
    client_name: str
    loads_count: int
    olive_kg: float
    oil_kg: float
    last_visit: datetime
    amount: Optional[float] = None


class ClientHistory(BaseModel):
    phone: str
    client_name: str
    loads_count: int
    olive_kg: float
    oil_kg: float
    avg_yield: Optional[float] = None
    amount: Optional[float] = None
    loads: list[Load]


class Certificate(BaseModel):
    analysis: LabAnalysis
    load: Optional[Load] = None
    mill: MillInfo


class TvItem(BaseModel):
    id: str
    code: Optional[str] = None  # None when the number is hidden on the TV
    finished_at: datetime


class TvBoard(BaseModel):
    today: str
    items: list[TvItem]
    server_time: datetime


class TvAdminItem(BaseModel):
    id: str
    code: str
    finished_at: datetime
    hidden: bool
    removed: bool


class TvItemUpdate(BaseModel):
    hidden: Optional[bool] = None
    removed: Optional[bool] = None

"""Customer-owned olive intake and oil custody release command schemas."""
from datetime import date
import re
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CustomerOliveCustodyReceiptDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    customer_phone: str = Field(min_length=5, max_length=40)
    receipt_date: date
    variety_id: str = Field(min_length=1, max_length=100)
    quantity_kg: Decimal = Field(gt=Decimal("0"), max_digits=18, decimal_places=3)
    source_load_id: str | None = Field(default=None, min_length=1, max_length=100)
    receiving_location_id: str = Field(min_length=1, max_length=100)
    customer_acknowledgement_reference: str = Field(min_length=3, max_length=120)
    source_reference: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)
    idempotency_key: str = Field(min_length=16, max_length=128)

    @field_validator("customer_phone", mode="before")
    @classmethod
    def normalize_customer_phone(cls, value):
        if not isinstance(value, str):
            return value
        normalized = re.sub(r"\s+", "", value)
        if not re.fullmatch(r"\+?[0-9().-]{5,40}", normalized):
            raise ValueError("Customer phone contains unsupported characters")
        if len(re.sub(r"\D", "", normalized)) < 5:
            raise ValueError("Customer phone must contain at least five digits")
        return normalized


class CustomerCustodyLoadSelection(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    source_load_id: str = Field(min_length=1, max_length=100)
    quantity_kg: Decimal = Field(gt=Decimal("0"), max_digits=18, decimal_places=3)


class CustomerOliveCustodyReceiptBatchDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    customer_phone: str = Field(min_length=5, max_length=40)
    receipt_date: date
    receiving_location_id: str = Field(min_length=1, max_length=100)
    customer_acknowledgement_reference: str = Field(min_length=3, max_length=120)
    source_reference: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)
    idempotency_key: str = Field(min_length=16, max_length=128)
    items: list[CustomerCustodyLoadSelection] = Field(min_length=1, max_length=100)

    @field_validator("customer_phone", mode="before")
    @classmethod
    def normalize_customer_phone(cls, value):
        if not isinstance(value, str):
            return value
        normalized = re.sub(r"\\s+", "", value)
        if not re.fullmatch(r"\\+?[0-9().-]{5,40}", normalized):
            raise ValueError("Customer phone contains unsupported characters")
        if len(re.sub(r"\\D", "", normalized)) < 5:
            raise ValueError("Customer phone must contain at least five digits")
        return normalized

    @field_validator("items")
    @classmethod
    def unique_source_loads(cls, items):
        ids = [item.source_load_id for item in items]
        if len(ids) != len(set(ids)):
            raise ValueError("A source load may only appear once in a custody batch")
        return items


class CustomerOilCustodyReleaseDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    customer_id: str = Field(min_length=1, max_length=100)
    release_date: date
    oil_lot_id: str = Field(min_length=1, max_length=100)
    source_tank_id: str = Field(min_length=1, max_length=100)
    quantity_kg: Decimal = Field(gt=Decimal("0"), max_digits=18, decimal_places=3)
    customer_acknowledgement_reference: str = Field(min_length=3, max_length=120)
    reason: str = Field(min_length=5, max_length=500)
    idempotency_key: str = Field(min_length=16, max_length=128)


class CancelCustomerCustodyDocumentCommand(BaseModel):
    """Audited cancellation of a custody movement that can still be reversed."""
    model_config = ConfigDict(extra="forbid", frozen=True)

    expected_version: int = Field(ge=1)
    reason: str = Field(min_length=5, max_length=500)


class CorrectCustomerOliveCustodyReceiptCommand(CancelCustomerCustodyDocumentCommand):
    replacement: CustomerOliveCustodyReceiptDraft


class CorrectCustomerOilCustodyReleaseCommand(CancelCustomerCustodyDocumentCommand):
    replacement: CustomerOilCustodyReleaseDraft

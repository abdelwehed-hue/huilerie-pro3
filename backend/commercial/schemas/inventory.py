"""Validated commercial inventory command schemas.

These models validate command shape only. They do not authorize a posting or
calculate balances; those checks belong in the transactional domain service.
"""
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


ProductKind = Literal["OLIVE", "OIL"]
OwnerKind = Literal["MILL", "CUSTOMER"]
MovementKind = Literal[
    "RECEIPT",
    "TRANSFER",
    "CONSUMPTION",
    "DISPATCH",
    "OWNERSHIP_TRANSFER",
]


class OwnerRef(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: OwnerKind
    customer_id: str | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_customer_identity(self):
        if self.kind == "CUSTOMER" and not self.customer_id:
            raise ValueError("customer_id is required for customer-owned stock")
        if self.kind == "MILL" and self.customer_id is not None:
            raise ValueError("customer_id must be empty for mill-owned stock")
        return self


class StockMovementDraft(BaseModel):
    """A proposed movement; never represents a posted ledger record."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    movement_kind: MovementKind
    product_kind: ProductKind
    lot_id: str = Field(min_length=1, max_length=100)
    quantity_kg: Decimal = Field(gt=Decimal("0"), max_digits=18, decimal_places=3)
    source_location_id: str | None = Field(default=None, min_length=1, max_length=100)
    destination_location_id: str | None = Field(default=None, min_length=1, max_length=100)
    source_owner: OwnerRef | None = None
    destination_owner: OwnerRef | None = None
    source_document_type: str = Field(min_length=2, max_length=12, pattern=r"^[A-Z0-9]+$")
    source_document_id: str = Field(min_length=1, max_length=100)
    idempotency_key: str = Field(min_length=16, max_length=128)
    reason: str = Field(min_length=3, max_length=500)

    @model_validator(mode="after")
    def validate_movement_shape(self):
        kind = self.movement_kind

        if kind == "RECEIPT":
            valid = (
                self.source_location_id is None
                and self.source_owner is None
                and self.destination_location_id is not None
                and self.destination_owner is not None
            )
        elif kind == "TRANSFER":
            valid = (
                self.source_location_id is not None
                and self.destination_location_id is not None
                and self.source_location_id != self.destination_location_id
                and self.source_owner is not None
                and self.destination_owner is not None
                and self.source_owner == self.destination_owner
            )
        elif kind in ("CONSUMPTION", "DISPATCH"):
            valid = (
                self.source_location_id is not None
                and self.source_owner is not None
                and self.destination_location_id is None
                and self.destination_owner is None
            )
        else:  # OWNERSHIP_TRANSFER
            valid = (
                self.source_location_id is not None
                and self.source_location_id == self.destination_location_id
                and self.source_owner is not None
                and self.destination_owner is not None
                and self.source_owner != self.destination_owner
            )

        if not valid:
            raise ValueError(f"Invalid location/owner fields for {kind}")
        return self


class CommercialLocationDraft(BaseModel):
    """Olive receiving/staging location; distinct from the nine oil tanks."""
    model_config = ConfigDict(extra="forbid", frozen=True)

    code: str = Field(min_length=2, max_length=20, pattern=r"^[A-Z0-9_-]+$")
    name: str = Field(min_length=2, max_length=100)
    kind: Literal["OLIVE_STORAGE", "STAGING"]
    notes: str | None = Field(default=None, max_length=500)



class OliveLotBalanceAdjustmentDraft(BaseModel):
    """Audited correction of an available olive lot balance at one location."""
    model_config = ConfigDict(extra="forbid", frozen=True)

    expected_version: int = Field(ge=1)
    location_id: str = Field(min_length=1, max_length=100)
    target_quantity_kg: Decimal = Field(ge=Decimal("0"), max_digits=18, decimal_places=3)
    reason: str = Field(min_length=5, max_length=500)

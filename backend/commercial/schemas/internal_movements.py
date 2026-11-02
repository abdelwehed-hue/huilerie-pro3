"""Internal stock movement command schemas."""
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from commercial.schemas.inventory import OwnerRef, ProductKind


class InternalMovementDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    movement_kind: Literal["TRANSFER", "OWNERSHIP_TRANSFER"]
    product_kind: ProductKind
    lot_id: str = Field(min_length=1, max_length=100)
    quantity_kg: Decimal = Field(gt=Decimal("0"), max_digits=18, decimal_places=3)
    source_location_id: str = Field(min_length=1, max_length=100)
    destination_location_id: str = Field(min_length=1, max_length=100)
    source_owner: OwnerRef
    destination_owner: OwnerRef
    idempotency_key: str = Field(min_length=16, max_length=128)
    reason: str = Field(min_length=3, max_length=500)

    @model_validator(mode="after")
    def validate_movement_shape(self):
        if self.movement_kind == "TRANSFER":
            valid = (
                self.source_location_id != self.destination_location_id
                and self.source_owner == self.destination_owner
            )
        else:
            valid = (
                self.source_location_id == self.destination_location_id
                and self.source_owner != self.destination_owner
            )
        if not valid:
            raise ValueError("Invalid locations or owners for internal movement kind")
        return self

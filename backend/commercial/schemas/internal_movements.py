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
    consent_method: Literal["DOCUMENT", "IN_APP"] | None = None
    consent_reference: str | None = Field(default=None, min_length=1, max_length=120)
    consent_customer_name: str | None = Field(default=None, min_length=2, max_length=120)
    consent_confirmed: bool = False

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
                and self.source_owner.kind != self.destination_owner.kind
            )
        if not valid:
            raise ValueError("Invalid locations or owners for internal movement kind")
        if self.movement_kind == "OWNERSHIP_TRANSFER":
            if self.consent_method == "DOCUMENT":
                if not self.consent_reference or self.consent_customer_name or self.consent_confirmed:
                    raise ValueError("A document reference is required for document-based consent")
            elif self.consent_method == "IN_APP":
                if not self.consent_customer_name or not self.consent_confirmed or self.consent_reference:
                    raise ValueError("Customer name and explicit confirmation are required for in-app consent")
            else:
                raise ValueError("Consent evidence is required for ownership transfers")
        elif self.consent_method is not None or self.consent_reference is not None or self.consent_customer_name is not None or self.consent_confirmed:
            raise ValueError("Consent evidence is only valid for ownership transfers")
        return self

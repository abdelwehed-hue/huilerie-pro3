"""Internal stock movement command schemas."""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
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
    consideration_type: Literal["SALE", "GIFT"] | None = None
    consideration_amount: Decimal | None = Field(default=None, gt=Decimal("0"), max_digits=18, decimal_places=3)
    consideration_unit_price_tnd_per_l: Decimal | None = Field(default=None, gt=Decimal("0"), max_digits=18, decimal_places=3)
    initial_payment_amount: Decimal | None = Field(default=None, gt=Decimal("0"), max_digits=18, decimal_places=3)
    initial_payment_method: Literal["CASH", "BANK_TRANSFER", "CHEQUE"] | None = None
    initial_payment_reference: str | None = Field(default=None, min_length=1, max_length=120)
    initial_payment_date: date | None = None

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
            if self.consideration_type == "SALE":
                if self.consideration_amount is None or self.consideration_amount <= 0:
                    raise ValueError("A positive agreed amount is required for a sale")
                if self.consideration_unit_price_tnd_per_l is None or self.consideration_unit_price_tnd_per_l <= 0:
                    raise ValueError("A positive unit price per litre is required for an oil purchase")
                expected_amount = (self.consideration_unit_price_tnd_per_l * self.quantity_kg).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
                if self.consideration_amount != expected_amount:
                    raise ValueError("The agreed amount must equal quantity multiplied by the unit price per litre")
                if self.product_kind != "OIL" or self.source_owner.kind != "CUSTOMER" or self.destination_owner.kind != "MILL":
                    raise ValueError("A customer-to-mill oil ownership transfer is required for an oil purchase")
                if self.initial_payment_amount is not None:
                    if self.initial_payment_amount > self.consideration_amount:
                        raise ValueError("Initial payment cannot exceed the agreed purchase amount")
                    if self.initial_payment_method is None:
                        raise ValueError("Payment method is required when an initial payment is recorded")
                    if self.initial_payment_method in {"BANK_TRANSFER", "CHEQUE"} and not (self.initial_payment_reference or "").strip():
                        raise ValueError("A reference is required for bank transfers and cheques")
                elif self.initial_payment_method is not None or self.initial_payment_reference is not None or self.initial_payment_date is not None:
                    raise ValueError("Initial payment details require a positive initial payment amount")
            elif self.consideration_type == "GIFT":
                if self.consideration_amount is not None or self.consideration_unit_price_tnd_per_l is not None:
                    raise ValueError("A gift transfer cannot include a sale amount or unit price")
                if any(value is not None for value in (self.initial_payment_amount, self.initial_payment_method, self.initial_payment_reference, self.initial_payment_date)):
                    raise ValueError("A gift transfer cannot include payment details")
            else:
                raise ValueError("Ownership transfer consideration type is required")
            if self.consent_method == "DOCUMENT":
                if not self.consent_reference or self.consent_customer_name or self.consent_confirmed:
                    raise ValueError("A document reference is required for document-based consent")
            elif self.consent_method == "IN_APP":
                if not self.consent_customer_name or not self.consent_confirmed or self.consent_reference:
                    raise ValueError("Customer name and explicit confirmation are required for in-app consent")
            else:
                raise ValueError("Consent evidence is required for ownership transfers")
        elif self.consent_method is not None or self.consent_reference is not None or self.consent_customer_name is not None or self.consent_confirmed or self.consideration_type is not None or self.consideration_amount is not None or self.consideration_unit_price_tnd_per_l is not None or self.initial_payment_amount is not None or self.initial_payment_method is not None or self.initial_payment_reference is not None or self.initial_payment_date is not None:
            raise ValueError("Consent evidence and consideration are only valid for ownership transfers")
        return self

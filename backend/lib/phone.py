import re


def normalize_tunisie_sms_phone(value: object) -> str:
    """Remove whitespace from a phone number before validation."""
    return re.sub(r"\s+", "", str(value or ""))


def is_valid_tunisie_sms_phone(phone: str) -> bool:
    """Accept 7–16 digits, optionally prefixed by one plus sign."""
    return re.fullmatch(r"\+?[0-9]{7,16}", phone) is not None

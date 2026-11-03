from lib.phone import is_valid_tunisie_sms_phone, normalize_tunisie_sms_phone


def test_normalizes_spaces_and_accepts_international_number():
    phone = normalize_tunisie_sms_phone(" +216 12 345 678 ")
    assert phone == "+21612345678"
    assert is_valid_tunisie_sms_phone(phone)


def test_accepts_plain_local_digits():
    assert is_valid_tunisie_sms_phone(normalize_tunisie_sms_phone("12345678"))


def test_rejects_empty_short_long_and_non_numeric_values():
    for value in ("", "123456", "12345678901234567", "12AB5678", "++21612345678"):
        assert not is_valid_tunisie_sms_phone(normalize_tunisie_sms_phone(value))


def test_normalization_removes_internal_whitespace():
    assert normalize_tunisie_sms_phone("216\t12\n345 678") == "21612345678"

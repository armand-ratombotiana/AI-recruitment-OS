from __future__ import annotations
import re

def validate_email(email: str) -> bool:
    return bool(re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email))

def validate_phone(phone: str) -> bool:
    return bool(re.match(r'^\+?[\d\s\-\(\)]{10,}$', phone))

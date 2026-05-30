"""AI-ROS Utility Tests."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

def test_pagination():
    from shared.utils.pagination import paginate
    items = [{"id": str(i)} for i in range(10)]
    result = paginate(items, limit=5)
    assert len(result["data"]) == 5
    assert result["pagination"]["has_more"] == True
    print("[OK] Pagination")

def test_validation():
    from shared.utils.validation import validate_email, validate_phone
    assert validate_email("test@example.com")
    assert not validate_email("invalid")
    assert validate_phone("+1-555-0123")
    print("[OK] Validation")

def test_crypto():
    from shared.utils.crypto import hash_string, generate_token
    h = hash_string("test")
    assert len(h) == 64
    token = generate_token()
    assert len(token) > 0
    print("[OK] Crypto")

if __name__ == "__main__":
    print("Utility Tests")
    test_pagination()
    test_validation()
    test_crypto()
    print("\nAll utility tests passed!")

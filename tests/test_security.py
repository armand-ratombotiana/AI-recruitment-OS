"""AI-ROS Security Tests."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

def test_password_hashing():
    from shared.core.security import hash_password, verify_password
    h = hash_password("test123")
    assert verify_password("test123", h)
    assert not verify_password("wrong", h)
    print("[OK] Password hashing")

def test_jwt_tokens():
    from shared.core.security import create_access_token, create_refresh_token, decode_token
    access = create_access_token({"sub": "user1"})
    refresh = create_refresh_token({"sub": "user1"})
    assert decode_token(access)["sub"] == "user1"
    assert decode_token(refresh)["sub"] == "user1"
    print("[OK] JWT tokens")

def test_api_keys():
    from shared.core.security import generate_api_key, hash_api_key
    key = generate_api_key()
    assert len(key) > 0
    hashed = hash_api_key(key)
    assert len(hashed) == 64
    print("[OK] API keys")

if __name__ == "__main__":
    print("Security Tests")
    test_password_hashing()
    test_jwt_tokens()
    test_api_keys()
    print("\nAll security tests passed!")

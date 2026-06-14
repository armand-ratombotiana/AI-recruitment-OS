"""Security hardening tests — input validation, encryption, headers, file uploads."""

from __future__ import annotations

import json
import os
import tempfile
import time

import pytest

from shared.security.validator import (
    InputSanitizer,
    SQLInjectionPreventer,
    PathTraversalPreventer,
    FileUploadValidator,
    EndpointRateLimiter,
    ValidationResult,
    FileValidationResult,
    RateLimitResult,
)
from shared.security.headers import (
    SecurityHeadersMiddleware,
    get_security_headers,
    get_cors_config,
    get_cookie_security,
    set_secure_cookie,
)
from shared.security.encryption import (
    EncryptionManager,
    FieldEncryption,
    DataAtRestEncryptor,
)


pytestmark = [pytest.mark.unit, pytest.mark.security]


# ── Input Sanitization (XSS Prevention) ──────────────────────────────────────


class TestInputSanitization:
    def test_sanitize_escapes_html(self):
        result = InputSanitizer.sanitize_string("<script>alert('xss')</script>")
        assert "<script>" not in result
        assert "&lt;script&gt;" in result

    def test_sanitize_escapes_quotes(self):
        result = InputSanitizer.sanitize_string('"><img onerror=alert(1)>')
        assert '"' not in result or "&quot;" in result

    def test_sanitize_removes_null_bytes(self):
        result = InputSanitizer.sanitize_string("hello\x00world")
        assert "\x00" not in result

    def test_check_xss_detects_script_tag(self):
        result = InputSanitizer.check_xss("<script>alert('xss')</script>")
        assert not result.is_valid
        assert len(result.threats_detected) > 0

    def test_check_xss_detects_event_handler(self):
        result = InputSanitizer.check_xss("<img onerror=alert(1)>")
        assert not result.is_valid

    def test_check_xss_detects_javascript_uri(self):
        result = InputSanitizer.check_xss("javascript:alert(document.cookie)")
        assert not result.is_valid

    def test_check_xss_detects_iframe(self):
        result = InputSanitizer.check_xss("<iframe src='evil.com'></iframe>")
        assert not result.is_valid

    def test_check_xss_clean_input(self):
        result = InputSanitizer.check_xss("Hello, this is a normal string")
        assert result.is_valid
        assert len(result.threats_detected) == 0

    def test_sanitize_dict(self):
        data = {"name": "<b>bold</b>", "nested": {"xss": "<script>x</script>"}}
        result = InputSanitizer.sanitize_dict(data)
        assert "<b>" not in result["name"]
        assert "<script>" not in result["nested"]["xss"]

    def test_sanitize_list(self):
        data = ["<script>x</script>", "normal", "<img onerror=x>"]
        result = InputSanitizer.sanitize_list(data)
        assert "<script>" not in result[0]
        assert result[1] == "normal"
        assert "<img" not in result[2]


# ── SQL Injection Prevention ─────────────────────────────────────────────────


class TestSQLInjectionPrevention:
    def test_detects_select_statement(self):
        result = SQLInjectionPreventer.check("SELECT * FROM users WHERE id=1")
        assert not result.is_valid

    def test_detects_union_injection(self):
        result = SQLInjectionPreventer.check("' UNION SELECT * FROM passwords --")
        assert not result.is_valid

    def test_detects_or_1_equals_1(self):
        result = SQLInjectionPreventer.check("admin' OR 1=1 --")
        assert not result.is_valid

    def test_detects_drop_table(self):
        result = SQLInjectionPreventer.check("DROP TABLE users;")
        assert not result.is_valid

    def test_detects_comment_injection(self):
        result = SQLInjectionPreventer.check("input' -- comment")
        assert not result.is_valid

    def test_detects_sleep_injection(self):
        result = SQLInjectionPreventer.check("1; SLEEP(5)")
        assert not result.is_valid

    def test_clean_input_passes(self):
        result = SQLInjectionPreventer.check("John Doe")
        assert result.is_valid

    def test_check_dict_detects_nested_threats(self):
        data = {"username": "normal_user", "search": "' OR 1=1 --"}
        result = SQLInjectionPreventer.check_dict(data)
        assert not result.is_valid
        assert any("search" in t for t in result.threats_detected)

    def test_check_dict_clean(self):
        data = {"name": "Alice", "email": "alice@example.com"}
        result = SQLInjectionPreventer.check_dict(data)
        assert result.is_valid


# ── Path Traversal Prevention ────────────────────────────────────────────────


class TestPathTraversalPrevention:
    def test_detects_dot_dot_slash(self):
        result = PathTraversalPreventer.check("../../etc/passwd")
        assert not result.is_valid

    def test_detects_encoded_traversal(self):
        result = PathTraversalPreventer.check("%2e%2e%2fsecret")
        assert not result.is_valid

    def test_safe_path_normal(self):
        result = PathTraversalPreventer.safe_path("/var/uploads", "file.pdf")
        assert result is not None
        assert "file.pdf" in result

    def test_safe_path_blocks_traversal(self):
        result = PathTraversalPreventer.safe_path("/var/uploads", "../../etc/passwd")
        assert result is None

    def test_validate_filename_strips_dangerous_chars(self):
        result = PathTraversalPreventer.validate_filename("../../../etc/passwd")
        assert "/" not in result
        assert result == "passwd"

    def test_validate_filename_empty_becomes_default(self):
        result = PathTraversalPreventer.validate_filename("!!!")
        assert result == "unnamed_file"

    def test_clean_path_passes(self):
        result = PathTraversalPreventer.check("uploads/2024/resume.pdf")
        assert result.is_valid


# ── File Upload Validation ───────────────────────────────────────────────────


class TestFileUploadValidation:
    def test_rejects_empty_file(self):
        validator = FileUploadValidator()
        result = validator.validate("test.pdf", b"")
        assert not result.is_valid
        assert "Empty file" in result.threats

    def test_rejects_oversized_file(self):
        validator = FileUploadValidator(max_size=100)
        result = validator.validate("test.pdf", b"x" * 200)
        assert not result.is_valid
        assert any("exceeds maximum" in t for t in result.threats)

    def test_validates_pdf_magic_bytes(self):
        validator = FileUploadValidator()
        pdf_content = b"%PDF-1.4 fake content"
        result = validator.validate("document.pdf", pdf_content, "application/pdf")
        assert result.is_valid
        assert result.detected_mime == "application/pdf"

    def test_validates_png_magic_bytes(self):
        validator = FileUploadValidator()
        png_content = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        result = validator.validate("image.png", png_content, "image/png")
        assert result.is_valid
        assert result.detected_mime == "image/png"

    def test_validates_jpeg_magic_bytes(self):
        validator = FileUploadValidator()
        jpeg_content = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        result = validator.validate("photo.jpg", jpeg_content, "image/jpeg")
        assert result.is_valid
        assert result.detected_mime == "image/jpeg"

    def test_detects_mime_mismatch(self):
        validator = FileUploadValidator()
        pdf_content = b"%PDF-1.4 fake content"
        result = validator.validate("document.pdf", pdf_content, "image/png")
        assert not result.is_valid
        assert any("MIME mismatch" in t for t in result.threats)

    def test_rejects_disallowed_type(self):
        validator = FileUploadValidator()
        result = validator.validate("script.exe", b"MZ" + b"\x00" * 100, "application/x-msdownload")
        assert not result.is_valid

    def test_sanitize_unsafe_filename(self):
        validator = FileUploadValidator()
        result = validator.validate("../../../etc/passwd", b"%PDF-1.4 test")
        assert any("Unsafe filename" in t for t in result.threats)


# ── Rate Limiting ────────────────────────────────────────────────────────────


class TestRateLimiting:
    def test_allows_under_limit(self):
        limiter = EndpointRateLimiter()
        limiter.configure("/api/test", max_requests=5, window_seconds=60)
        result = limiter.check("/api/test", "client1")
        assert result.allowed
        assert result.remaining == 4

    def test_blocks_over_limit(self):
        limiter = EndpointRateLimiter()
        limiter.configure("/api/test", max_requests=2, window_seconds=60)
        limiter.check("/api/test", "client1")
        limiter.check("/api/test", "client1")
        result = limiter.check("/api/test", "client1")
        assert not result.allowed
        assert result.remaining == 0
        assert result.retry_after > 0

    def test_different_clients_independent(self):
        limiter = EndpointRateLimiter()
        limiter.configure("/api/test", max_requests=1, window_seconds=60)
        r1 = limiter.check("/api/test", "client_a")
        r2 = limiter.check("/api/test", "client_b")
        assert r1.allowed
        assert r2.allowed

    def test_reset_clears_bucket(self):
        limiter = EndpointRateLimiter()
        limiter.configure("/api/test", max_requests=1, window_seconds=60)
        limiter.check("/api/test", "c1")
        result = limiter.check("/api/test", "c1")
        assert not result.allowed
        limiter.reset("/api/test", "c1")
        result = limiter.check("/api/test", "c1")
        assert result.allowed

    def test_default_config_when_unconfigured(self):
        limiter = EndpointRateLimiter()
        result = limiter.check("/unknown/endpoint", "client1")
        assert result.allowed
        assert result.limit == 100


# ── Security Headers ─────────────────────────────────────────────────────────


class TestSecurityHeaders:
    def test_headers_include_csp(self):
        headers = get_security_headers()
        assert "Content-Security-Policy" in headers
        assert "default-src 'self'" in headers["Content-Security-Policy"]

    def test_headers_include_hsts(self):
        headers = get_security_headers()
        assert "Strict-Transport-Security" in headers
        assert "max-age=" in headers["Strict-Transport-Security"]

    def test_headers_include_x_frame_options(self):
        headers = get_security_headers()
        assert "X-Frame-Options" in headers
        assert headers["X-Frame-Options"] == "DENY"

    def test_headers_include_x_content_type(self):
        headers = get_security_headers()
        assert headers["X-Content-Type-Options"] == "nosniff"

    def test_headers_include_referrer_policy(self):
        headers = get_security_headers()
        assert "Referrer-Policy" in headers

    def test_cors_config_structure(self):
        cors = get_cors_config()
        assert "allow_origins" in cors
        assert "allow_methods" in cors
        assert "allow_headers" in cors
        assert cors["allow_credentials"] is True

    def test_cors_allows_authorization_header(self):
        cors = get_cors_config()
        assert "Authorization" in cors["allow_headers"]

    def test_cookie_security_flags(self):
        cookies = get_cookie_security()
        assert cookies["secure"] is True
        assert cookies["httponly"] is True
        assert cookies["samesite"] == "lax"


# ── Encryption ───────────────────────────────────────────────────────────────


class TestEncryption:
    def test_encrypt_decrypt_roundtrip(self):
        mgr = EncryptionManager("my-secret-key-for-testing-32chars!!")
        plaintext = "sensitive data: SSN 123-45-6789"
        ciphertext = mgr.encrypt(plaintext)
        assert ciphertext != plaintext
        decrypted = mgr.decrypt(ciphertext)
        assert decrypted == plaintext

    def test_different_encryptions_differ(self):
        mgr = EncryptionManager("my-secret-key-for-testing-32chars!!")
        c1 = mgr.encrypt("same input")
        c2 = mgr.encrypt("same input")
        assert c1 != c2

    def test_decrypt_wrong_key_fails(self):
        mgr1 = EncryptionManager("key-one-for-testing-32-chars!!!!!")
        mgr2 = EncryptionManager("key-two-for-testing-32-chars!!!!!")
        ciphertext = mgr1.encrypt("secret")
        with pytest.raises(ValueError):
            mgr2.decrypt(ciphertext)

    def test_key_rotation_preserves_old_decryption(self):
        mgr = EncryptionManager("original-key-for-testing-32chars!!")
        ciphertext_old = mgr.encrypt("data encrypted with old key")
        mgr.rotate_key("new-key-for-testing-32-chars!!!!")
        assert mgr.decrypt(ciphertext_old) == "data encrypted with old key"

    def test_new_encryption_uses_newest_key(self):
        mgr = EncryptionManager("original-key-for-testing-32chars!!")
        mgr.rotate_key("new-key-for-testing-32-chars!!!!")
        assert mgr.current_version == 2
        assert len(mgr.versions) == 2

    def test_field_encryption_roundtrip(self):
        mgr = EncryptionManager("field-enc-key-for-testing-32chars!")
        fe = FieldEncryption(mgr)
        encrypted = fe.encrypt_field("candidate@email.com")
        assert encrypted.startswith("enc:v1:")
        assert "candidate@email.com" not in encrypted
        decrypted = fe.decrypt_field(encrypted)
        assert decrypted == "candidate@email.com"

    def test_field_encryption_empty_passthrough(self):
        mgr = EncryptionManager("field-enc-key-for-testing-32chars!")
        fe = FieldEncryption(mgr)
        assert fe.encrypt_field("") == ""
        assert fe.decrypt_field("") == ""

    def test_field_encryption_detects_encrypted(self):
        mgr = EncryptionManager("field-enc-key-for-testing-32chars!")
        fe = FieldEncryption(mgr)
        encrypted = fe.encrypt_field("test")
        assert fe.is_encrypted(encrypted)
        assert not fe.is_encrypted("plaintext")

    def test_encrypt_decrypt_record(self):
        mgr = EncryptionManager("record-enc-key-for-testing-32chars")
        fe = FieldEncryption(mgr)
        record = {"name": "Alice", "email": "alice@test.com", "phone": "555-0123"}
        encrypted = fe.encrypt_record(record, ["email", "phone"])
        assert encrypted["name"] == "Alice"
        assert encrypted["email"] != "alice@test.com"
        assert encrypted["phone"] != "555-0123"
        decrypted = fe.decrypt_record(encrypted, ["email", "phone"])
        assert decrypted["email"] == "alice@test.com"
        assert decrypted["phone"] == "555-0123"

    def test_data_at_rest_encrypt_dict(self):
        mgr = EncryptionManager("at-rest-key-for-testing-32chars!!")
        encryptor = DataAtRestEncryptor(mgr)
        data = {"users": [{"id": 1, "name": "Alice"}], "count": 1}
        ciphertext = encryptor.encrypt_data(data)
        assert isinstance(ciphertext, str)
        decrypted = encryptor.decrypt_data(ciphertext)
        assert decrypted["count"] == 1
        assert decrypted["users"][0]["name"] == "Alice"

    def test_data_at_rest_encrypt_file(self):
        mgr = EncryptionManager("file-enc-key-for-testing-32chars!!")
        encryptor = DataAtRestEncryptor(mgr)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".txt") as f:
            f.write(b"sensitive file content")
            tmp_path = f.name
        try:
            encrypted_b64 = encryptor.encrypt_file(tmp_path)
            assert isinstance(encrypted_b64, str)
            output_path = tmp_path + ".decrypted"
            encryptor.decrypt_file(encrypted_b64, output_path)
            with open(output_path, "rb") as f:
                assert f.read() == b"sensitive file content"
            os.unlink(output_path)
        finally:
            os.unlink(tmp_path)

    def test_encrypt_bytes_roundtrip(self):
        mgr = EncryptionManager("bytes-enc-key-for-testing-32chars!!")
        data = b"\x00\x01\x02\xff\xfe binary data"
        encrypted = mgr.encrypt_bytes(data)
        assert encrypted != data
        decrypted = mgr.decrypt_bytes(encrypted)
        assert decrypted == data

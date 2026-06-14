from __future__ import annotations

import base64
import hashlib
import json
import os
import time
from dataclasses import dataclass, field
from typing import Any

from cryptography.fernet import Fernet, MultiFernet, InvalidToken


def _derive_fernet_key(secret: str) -> bytes:
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


@dataclass
class KeyVersion:
    version: int
    key: bytes
    created_at: float = field(default_factory=time.time)


class EncryptionManager:
    def __init__(self, primary_key: str, key_version: int = 1) -> None:
        self._primary_key = _derive_fernet_key(primary_key)
        self._primary_version = key_version
        self._key_store: dict[int, KeyVersion] = {}
        self._key_store[key_version] = KeyVersion(
            version=key_version,
            key=self._primary_key,
        )
        self._build_fernet()

    def _build_fernet(self) -> None:
        sorted_versions = sorted(self._key_store.keys(), reverse=True)
        fernets = [Fernet(self._key_store[v].key) for v in sorted_versions]
        if not fernets:
            fernets = [Fernet(self._primary_key)]
        self._fernet = MultiFernet(fernets)

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")

    def decrypt(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
        except InvalidToken:
            raise ValueError("Decryption failed: invalid token or wrong key")

    def encrypt_bytes(self, data: bytes) -> bytes:
        return self._fernet.encrypt(data)

    def decrypt_bytes(self, data: bytes) -> bytes:
        try:
            return self._fernet.decrypt(data)
        except InvalidToken:
            raise ValueError("Decryption failed: invalid token or wrong key")

    def add_key_version(self, new_key: str, version: int | None = None) -> int:
        new_version = version or (max(self._key_store.keys()) + 1)
        if new_version in self._key_store:
            raise ValueError(f"Key version {new_version} already exists")
        derived = _derive_fernet_key(new_key)
        self._key_store[new_version] = KeyVersion(
            version=new_version,
            key=derived,
        )
        self._primary_key = derived
        self._primary_version = new_version
        self._build_fernet()
        return new_version

    def rotate_key(self, new_key: str, version: int | None = None) -> int:
        return self.add_key_version(new_key, version)

    def re_encrypt(self, ciphertext: str) -> str:
        plaintext = self.decrypt(ciphertext)
        old_primary = self._primary_key
        sorted_versions = sorted(self._key_store.keys(), reverse=True)
        fernets = [Fernet(self._key_store[v].key) for v in sorted_versions]
        temp_fernet = MultiFernet(fernets)
        _ = temp_fernet.decrypt(ciphertext.encode("utf-8"))
        primary_fernet = Fernet(self._key_store[self._primary_version].key)
        return primary_fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")

    @property
    def current_version(self) -> int:
        return self._primary_version

    @property
    def versions(self) -> list[int]:
        return sorted(self._key_store.keys())


class FieldEncryption:
    FIELD_PREFIX = "enc:v1:"

    def __init__(self, manager: EncryptionManager) -> None:
        self._manager = manager

    def encrypt_field(self, value: str) -> str:
        if not value:
            return value
        encrypted = self._manager.encrypt(value)
        return f"{self.FIELD_PREFIX}{encrypted}"

    def decrypt_field(self, value: str) -> str:
        if not value:
            return value
        if not value.startswith(self.FIELD_PREFIX):
            return value
        ciphertext = value[len(self.FIELD_PREFIX):]
        return self._manager.decrypt(ciphertext)

    def is_encrypted(self, value: str) -> bool:
        return value.startswith(self.FIELD_PREFIX) if value else False

    def encrypt_record(self, record: dict[str, Any], fields: list[str]) -> dict[str, Any]:
        result = dict(record)
        for f in fields:
            if f in result and isinstance(result[f], str):
                result[f] = self.encrypt_field(result[f])
        return result

    def decrypt_record(self, record: dict[str, Any], fields: list[str]) -> dict[str, Any]:
        result = dict(record)
        for f in fields:
            if f in result and isinstance(result[f], str):
                result[f] = self.decrypt_field(result[f])
        return result


class DataAtRestEncryptor:
    def __init__(self, manager: EncryptionManager) -> None:
        self._manager = manager

    def encrypt_data(self, data: Any) -> str:
        serialized = json.dumps(data, default=str, sort_keys=True)
        return self._manager.encrypt(serialized)

    def decrypt_data(self, ciphertext: str) -> Any:
        plaintext = self._manager.decrypt(ciphertext)
        return json.loads(plaintext)

    def encrypt_file(self, filepath: str) -> str:
        with open(filepath, "rb") as f:
            data = f.read()
        encrypted = self._manager.encrypt_bytes(data)
        return base64.b64encode(encrypted).decode("utf-8")

    def decrypt_file(self, ciphertext_b64: str, output_path: str) -> None:
        encrypted = base64.b64decode(ciphertext_b64)
        decrypted = self._manager.decrypt_bytes(encrypted)
        with open(output_path, "wb") as f:
            f.write(decrypted)

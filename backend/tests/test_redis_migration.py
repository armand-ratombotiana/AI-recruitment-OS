import pytest
from unittest.mock import Mock, patch

from shared.security.rate_limit_advanced import RedisRateLimiter
from shared.security.ddos import RedisDDoSProtection


class TestRedisRateLimiter:
    def _make_limiter(self) -> RedisRateLimiter:
        limiter = RedisRateLimiter.__new__(RedisRateLimiter)
        limiter.redis = Mock()
        return limiter

    def test_allows_under_limit(self):
        limiter = self._make_limiter()
        limiter.redis.incr.return_value = 1
        limiter.redis.expire.return_value = True

        assert limiter.is_allowed("test-key", 10, 60) is True
        limiter.redis.incr.assert_called_once_with("test-key")
        limiter.redis.expire.assert_called_once_with("test-key", 60)

    def test_allows_at_limit(self):
        limiter = self._make_limiter()
        limiter.redis.incr.return_value = 10

        assert limiter.is_allowed("test-key", 10, 60) is True

    def test_blocks_over_limit(self):
        limiter = self._make_limiter()
        limiter.redis.incr.return_value = 11

        assert limiter.is_allowed("test-key", 10, 60) is False

    def test_does_not_expire_on_subsequent_requests(self):
        limiter = self._make_limiter()
        limiter.redis.incr.return_value = 5

        limiter.is_allowed("test-key", 10, 60)
        limiter.redis.expire.assert_not_called()

    def test_get_remaining_positive(self):
        limiter = self._make_limiter()
        limiter.redis.get.return_value = "3"

        assert limiter.get_remaining("test-key", 10) == 7

    def test_get_remaining_zero_when_exhausted(self):
        limiter = self._make_limiter()
        limiter.redis.get.return_value = "15"

        assert limiter.get_remaining("test-key", 10) == 0

    def test_get_remaining_full_when_no_requests(self):
        limiter = self._make_limiter()
        limiter.redis.get.return_value = None

        assert limiter.get_remaining("test-key", 10) == 10

    def test_reset_deletes_key(self):
        limiter = self._make_limiter()
        limiter.redis.delete.return_value = 1

        limiter.reset("test-key")
        limiter.redis.delete.assert_called_once_with("test-key")


class TestRedisDDoSProtection:
    def _make_protection(self) -> RedisDDoSProtection:
        protection = RedisDDoSProtection.__new__(RedisDDoSProtection)
        protection.redis = Mock()
        return protection

    def test_record_request_increments_and_expires(self):
        protection = self._make_protection()
        protection.redis.incr.return_value = 1
        protection.redis.expire.return_value = True

        protection.record_request("1.2.3.4")
        protection.redis.incr.assert_called_once_with("ddos:1.2.3.4")
        protection.redis.expire.assert_called_once_with("ddos:1.2.3.4", 60)

    def test_is_blocked_false_under_threshold(self):
        protection = self._make_protection()
        protection.redis.get.return_value = "50"

        assert protection.is_blocked("1.2.3.4", threshold=100) is False

    def test_is_blocked_true_over_threshold(self):
        protection = self._make_protection()
        protection.redis.get.return_value = "150"

        assert protection.is_blocked("1.2.3.4", threshold=100) is True

    def test_is_blocked_false_when_no_requests(self):
        protection = self._make_protection()
        protection.redis.get.return_value = None

        assert protection.is_blocked("1.2.3.4", threshold=100) is False

    def test_block_ip_sets_key_with_duration(self):
        protection = self._make_protection()
        protection.redis.setex.return_value = True

        protection.block_ip("1.2.3.4", duration=7200)
        protection.redis.setex.assert_called_once_with("blocked:1.2.3.4", 7200, "1")

    def test_is_ip_blocked_true(self):
        protection = self._make_protection()
        protection.redis.exists.return_value = 1

        assert protection.is_ip_blocked("1.2.3.4") is True

    def test_is_ip_blocked_false(self):
        protection = self._make_protection()
        protection.redis.exists.return_value = 0

        assert protection.is_ip_blocked("1.2.3.4") is False

    def test_unblock_ip_deletes_key(self):
        protection = self._make_protection()
        protection.redis.delete.return_value = 1

        assert protection.unblock_ip("1.2.3.4") is True
        protection.redis.delete.assert_called_once_with("blocked:1.2.3.4")

    def test_unblock_ip_returns_false_when_not_found(self):
        protection = self._make_protection()
        protection.redis.delete.return_value = 0

        assert protection.unblock_ip("1.2.3.4") is False

    def test_get_request_count(self):
        protection = self._make_protection()
        protection.redis.get.return_value = "42"

        assert protection.get_request_count("1.2.3.4") == 42

    def test_get_request_count_zero_when_no_data(self):
        protection = self._make_protection()
        protection.redis.get.return_value = None

        assert protection.get_request_count("1.2.3.4") == 0

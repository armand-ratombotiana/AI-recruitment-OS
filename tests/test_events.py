"""AI-ROS Event Tests."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

def test_event_schemas():
    from shared.events.schemas import EventEnvelope, build_event
    event = build_event("test.event", "tenant_123", {"key": "value"})
    assert event.event_type == "test.event"
    assert event.tenant_id == "tenant_123"
    assert event.payload == {"key": "value"}
    print("[OK] Event Schemas")

def test_event_handlers():
    from shared.events.handlers import EventDispatcher
    dispatcher = EventDispatcher()
    assert dispatcher._handlers == {}
    print("[OK] Event Handlers")

if __name__ == "__main__":
    print("Event Tests")
    test_event_schemas()
    test_event_handlers()
    print("\nAll event tests passed!")

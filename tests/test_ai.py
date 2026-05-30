"""AI-ROS AI Tests."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

def test_llm_router():
    from shared.ai.llm_router import LLMRouter, LLMResponse
    router = LLMRouter()
    assert router.metrics
    response = LLMResponse(content="test", model="gpt-4o", prompt_tokens=10, completion_tokens=5, total_tokens=15, latency_ms=1.0, provider="mock")
    assert response.content == "test"
    print("[OK] LLM Router")

def test_base_agent():
    from shared.ai.base_agent import BaseAgent, AgentType, AgentStatus
    assert AgentType.PPE_EVALUATION
    assert AgentStatus.IDLE
    print("[OK] Base Agent")

def test_prompts():
    from shared.ai.prompts import PromptManager, DEFAULT_PROMPTS
    pm = PromptManager()
    assert DEFAULT_PROMPTS
    print("[OK] Prompts")

def test_rag():
    from shared.ai.rag import RAGPipeline
    assert RAGPipeline
    print("[OK] RAG Pipeline")

def test_memory():
    from shared.ai.memory import MemoryStore
    assert MemoryStore
    print("[OK] Memory Store")

if __name__ == "__main__":
    print("AI Tests")
    test_llm_router()
    test_base_agent()
    test_prompts()
    test_rag()
    test_memory()
    print("\nAll AI tests passed!")

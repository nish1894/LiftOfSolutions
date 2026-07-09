from chatbot.rag import (
    DocumentProfile,
    RagStrategy,
    decide_rag_strategy,
    select_rag_strategy_node,
)


def testDirectDocumentForSingleSmallDocument() -> None:
    decision = decide_rag_strategy(
        [DocumentProfile(name="refund-policy.pdf", char_count=5000)]
    )

    assert decision.strategy == RagStrategy.DIRECT_DOCUMENT
    assert decision.implemented is True
    assert decision.document_count == 1
    assert decision.total_chars == 5000


def testVectorDbForMultipleDocuments() -> None:
    decision = decide_rag_strategy(
        [
            DocumentProfile(name="refund-policy.pdf", char_count=5000),
            DocumentProfile(name="shipping-rules.pdf", char_count=7000),
        ]
    )

    assert decision.strategy == RagStrategy.VECTOR_DB
    assert decision.implemented is True


def testVectorDbForOneLargeDocument() -> None:
    decision = decide_rag_strategy(
        [DocumentProfile(name="support-manual.pdf", char_count=150000)]
    )

    assert decision.strategy == RagStrategy.VECTOR_DB
    assert decision.implemented is True


def testEnterpriseForHugeDocumentSet() -> None:
    documents = [
        DocumentProfile(name=f"manual-{index}.pdf", char_count=50000)
        for index in range(500)
    ]

    decision = decide_rag_strategy(documents)

    assert decision.strategy == RagStrategy.ENTERPRISE
    assert decision.implemented is False


def testLanggraphNodeAddsRagDecisionToState() -> None:
    state = {
        "customer_id": "acme",
        "documents": [{"name": "faq.md", "content_type": "text/markdown", "char_count": 3000}],
    }

    updated = select_rag_strategy_node(state)

    assert updated["customer_id"] == "acme"
    assert updated["rag_decision"]["strategy"] == "direct_document"

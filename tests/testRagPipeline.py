from chatbot.rag import (
    InMemoryVectorIndex,
    RagStrategy,
    UploadedDocument,
    chunk_documents,
    init_embedding_model,
    load_documents,
    rag_node,
    query_vectorless_chunks,
)


def testLoadDocumentsCreatesLangchainDocuments() -> None:
    documents = load_documents(
        [
            {
                "name": "faq.md",
                "content": "Refunds are available for 30 days.",
                "content_type": "text/markdown",
                "metadata": {"customer": "acme"},
            }
        ]
    )

    assert documents[0].page_content == "Refunds are available for 30 days."
    assert documents[0].metadata["source"] == "faq.md"
    assert documents[0].metadata["customer"] == "acme"


def testChunkDocumentsAddsChunkMetadata() -> None:
    documents = load_documents(
        [UploadedDocument(name="manual.txt", content="abcdefghij" * 5)]
    )

    chunks = chunk_documents(documents, chunk_size=20, chunk_overlap=5)

    assert len(chunks) > 1
    assert chunks[0].metadata["chunk_index"] == 0
    assert chunks[0].metadata["source"] == "manual.txt"


def testHashEmbeddingsAndVectorIndexReturnRelevantChunk() -> None:
    documents = load_documents(
        [
            UploadedDocument(name="refunds.txt", content="Refunds are allowed within thirty days."),
            UploadedDocument(name="shipping.txt", content="Shipping usually takes five business days."),
        ]
    )
    embeddings = init_embedding_model("hash")
    index = InMemoryVectorIndex.from_documents(documents, embeddings)

    matches = index.search("How do refunds work?", embeddings, top_k=1)

    assert matches[0].document.metadata["source"] == "refunds.txt"


def testVectorlessSearchReturnsRelevantChunk() -> None:
    documents = load_documents(
        [
            UploadedDocument(name="refunds.txt", content="Refunds are allowed within thirty days."),
            UploadedDocument(name="shipping.txt", content="Shipping usually takes five business days."),
        ]
    )
    chunks = chunk_documents(documents, chunk_size=100, chunk_overlap=0)

    result = query_vectorless_chunks(chunks, "How do refunds work?", top_k=1)

    assert result.sources[0].source == "refunds.txt"
    assert "refund" in result.context.lower()


def testRagNodeUsesDirectDocumentForSmallSingleDocument() -> None:
    state = rag_node(
        {
            "query": "What is the refund window?",
            "documents": [
                {
                    "name": "refunds.txt",
                    "content": "Customers can request refunds within 30 days.",
                }
            ],
        }
    )

    assert state["rag_decision"]["strategy"] == RagStrategy.DIRECT_DOCUMENT
    assert "30 days" in state["rag_context"]
    assert state["rag_sources"][0]["source"] == "refunds.txt"


def testRagNodeUsesVectorlessSearchForMultipleSmallDocuments() -> None:
    state = rag_node(
        {
            "query": "When can a customer get a refund?",
            "documents": [
                {
                    "name": "refunds.txt",
                    "content": "A customer refund is available within 30 days of purchase.",
                },
                {
                    "name": "shipping.txt",
                    "content": "Shipping takes five business days after dispatch.",
                },
            ],
            "top_k": 1,
        }
    )

    assert state["rag_decision"]["strategy"] == "vectorless"
    assert state["rag_sources"][0]["source"] == "refunds.txt"
    assert "refund" in state["rag_context"].lower()


def testRagNodeUsesVectorSearchForLargerDocumentCollection() -> None:
    documents = [
        {
            "name": f"manual-{index}.txt",
            "content": "General support information. " * 2000,
        }
        for index in range(20)
    ]
    documents.append(
        {
            "name": "refunds.txt",
            "content": "A customer refund is available within 30 days of purchase.",
        }
    )

    state = rag_node(
        {
            "query": "When can a customer get a refund?",
            "documents": documents,
            "top_k": 1,
        }
    )

    assert state["rag_decision"]["strategy"] == "vector_db"
    assert state["rag_sources"]

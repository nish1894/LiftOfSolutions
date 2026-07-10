from pathlib import Path
import sys
import zipfile

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from chatbot.rag import (
    DocumentSource,
    InMemoryVectorIndex,
    LocalVectorDbStore,
    RagStrategy,
    UploadedDocument,
    chunk_documents,
    defaultVectorDbStore,
    fetchDocuments,
    ingestVectorDb,
    init_embedding_model,
    load_documents,
    processDocumentsForRag,
    queryVectorDb,
    rag_node,
    query_vectorless_chunks,
)
from chatbot.main import app

from langchain_core.documents import Document
from fastapi.testclient import TestClient


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


def testFetchDocumentsLoadsInlineDocumentsAndZipFiles(tmp_path) -> None:
    zip_path = tmp_path / "support.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr("refunds.txt", "Refunds are available for 30 days.")
        archive.writestr("shipping.txt", "Shipping takes five business days.")

    documents = fetchDocuments(
        DocumentSource(
            documents=[UploadedDocument(name="faq.txt", content="Support FAQ")],
            zipPath=str(zip_path),
        )
    )

    assert len(documents) == 3
    assert {document.metadata["source"] for document in documents} == {
        "faq.txt",
        "refunds.txt",
        "shipping.txt",
    }


def testChunkDocumentsAddsChunkMetadata() -> None:
    documents = load_documents(
        [UploadedDocument(name="manual.txt", content="abcdefghij" * 5)]
    )

    chunks = chunk_documents(documents, chunk_size=20, chunk_overlap=5)

    assert len(chunks) > 1
    assert chunks[0].metadata["chunk_index"] == 0
    assert chunks[0].metadata["source"] == "manual.txt"


def testProcessDocumentsForRagCanEnhanceDocumentsBeforeChunking() -> None:
    def enhancer(documents: list[Document]) -> list[Document]:
        return [
            Document(
                page_content=document.page_content
                + "\nCases: damaged item, missing receipt, late refund.",
                metadata={**document.metadata, "llm_enhanced": True},
            )
            for document in documents
        ]

    documents = load_documents(
        [UploadedDocument(name="refunds.txt", content="Refunds are available.")]
    )

    chunks = processDocumentsForRag(
        documents,
        enhancer=enhancer,
        chunk_size=200,
        chunk_overlap=0,
    )

    assert chunks[0].metadata["llm_enhanced"] is True
    assert "damaged item" in chunks[0].page_content


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


def testIngestVectorDbStoresNamedDatabaseAndQueriesIt() -> None:
    store = LocalVectorDbStore()

    result = ingestVectorDb(
        {
            "dbName": "supportDocs",
            "source": {
                "documents": [
                    {
                        "name": "refunds.txt",
                        "content": "Refunds are allowed within thirty days.",
                    },
                    {
                        "name": "shipping.txt",
                        "content": "Shipping usually takes five business days.",
                    },
                ]
            },
            "chunkSize": 100,
            "chunkOverlap": 0,
        },
        store=store,
    )
    query_result = queryVectorDb(
        "supportDocs",
        "How do refunds work?",
        topK=1,
        store=store,
    )

    assert result.dbName == "supportDocs"
    assert result.documentCount == 2
    assert result.chunkCount == 2
    assert query_result.sources[0].source == "refunds.txt"


def testIngestVectorDbCanUseDocumentEnhancer() -> None:
    store = LocalVectorDbStore()

    def enhancer(documents: list[Document]) -> list[Document]:
        return [
            Document(
                page_content=document.page_content
                + "\nExpanded cases: refund without receipt, damaged product.",
                metadata={**document.metadata, "llm_enhanced": True},
            )
            for document in documents
        ]

    result = ingestVectorDb(
        {
            "dbName": "enhancedSupportDocs",
            "source": {
                "documents": [
                    {
                        "name": "refunds.txt",
                        "content": "Refunds are available within thirty days.",
                    }
                ]
            },
            "chunkSize": 200,
            "chunkOverlap": 0,
        },
        store=store,
        enhancer=enhancer,
    )
    query_result = queryVectorDb(
        "enhancedSupportDocs",
        "What if a product is damaged?",
        topK=1,
        store=store,
    )

    assert result.enhanced is True
    assert query_result.sources[0].source == "refunds.txt"
    assert "damaged product" in query_result.context


def testIngestVectorDbEnhancementToggleUsesProvidedEnhancer() -> None:
    store = LocalVectorDbStore()

    def enhancer(documents: list[Document]) -> list[Document]:
        return [
            Document(
                page_content=document.page_content + "\nChatGPT expanded cases.",
                metadata={**document.metadata, "llm_enhanced": True},
            )
            for document in documents
        ]

    result = ingestVectorDb(
        {
            "dbName": "toggleEnhancedDocs",
            "source": {
                "documents": [
                    {
                        "name": "faq.txt",
                        "content": "Support teams answer customer questions.",
                    }
                ]
            },
            "enhanceDocuments": True,
            "chunkSize": 200,
            "chunkOverlap": 0,
        },
        store=store,
        enhancer=enhancer,
    )

    assert result.enhanced is True
    assert store.load("toggleEnhancedDocs").chunks[0].metadata["llm_enhanced"] is True


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
            "useVectorDbForMediumDocs": True,
        }
    )

    assert state["rag_decision"]["strategy"] == "vector_db"
    assert state["rag_sources"]


def testRagNodeQueriesStoredVectorDbByName() -> None:
    defaultVectorDbStore.clear()
    ingestVectorDb(
        {
            "dbName": "supportDocs",
            "source": {
                "documents": [
                    {
                        "name": "refunds.txt",
                        "content": "Refunds are allowed within thirty days.",
                    },
                    {
                        "name": "shipping.txt",
                        "content": "Shipping usually takes five business days.",
                    },
                ]
            },
            "chunkSize": 100,
            "chunkOverlap": 0,
        }
    )

    state = rag_node(
        {
            "dbName": "supportDocs",
            "query": "How do refunds work?",
            "top_k": 1,
        }
    )

    assert state["rag_sources"][0]["source"] == "refunds.txt"
    assert "refund" in state["rag_context"].lower()


def testInternalRagQueryApiReturnsTopThreeInfo() -> None:
    defaultVectorDbStore.clear()
    ingestVectorDb(
        {
            "dbName": "supportDocs",
            "source": {
                "documents": [
                    {
                        "name": "refunds.txt",
                        "content": "Refunds are allowed within thirty days.",
                    },
                    {
                        "name": "shipping.txt",
                        "content": "Shipping usually takes five business days.",
                    },
                    {
                        "name": "warranty.txt",
                        "content": "Warranty claims cover manufacturing defects.",
                    },
                ]
            },
            "chunkSize": 100,
            "chunkOverlap": 0,
        }
    )
    client = TestClient(app)

    response = client.post(
        "/api/internal/rag/query",
        json={"dbName": "supportDocs", "question": "How do refunds work?"},
    )
    payload = response.json()

    assert response.status_code == 200
    assert len(payload["sources"]) == 3
    assert payload["sources"][0]["source"] == "refunds.txt"
    assert "refund" in payload["context"].lower()


def testSampleSolarSystemRarIngestsAndAnswersFiveQuestions() -> None:
    archive_path = "sample/wikipedia_planets.rar"
    store = LocalVectorDbStore()
    result = ingestVectorDb(
        {
            "dbName": "solarSystem",
            "source": {"archivePath": archive_path},
            "chunkSize": 200000,
            "chunkOverlap": 0,
        },
        store=store,
    )
    questions = [
        (
            "What does the Mars article say about Mars and the Red Planet?",
            "Mars.txt",
            "red planet",
        ),
        (
            "What does the Jupiter article say about Jupiter and the largest planet?",
            "Jupiter.txt",
            "largest",
        ),
        (
            "What does the Earth article say about Earth and life?",
            "Earth.txt",
            "life",
        ),
        (
            "What does the Neptune article say about Neptune and the farthest planet?",
            "Neptune.txt",
            "farthest",
        ),
        (
            "What does the Venus article say about Venus and the second planet?",
            "Venus.txt",
            "second planet",
        ),
    ]

    assert result.dbName == "solarSystem"
    assert result.documentCount == 9
    assert result.stored is True

    for question, expected_source, expected_text in questions:
        query_result = queryVectorDb(
            "solarSystem",
            question,
            topK=1,
            store=store,
        )
        source = query_result.sources[0]

        print(f"\nSOLAR QUESTION: {question}")
        print(f"SOLAR SOURCE: {source.source}")
        print(f"SOLAR CONTEXT: {source.content[:240]}")
        assert source.source == expected_source
        assert expected_text in source.content.lower()


if __name__ == "__main__":
    import subprocess

    raise SystemExit(
        subprocess.call([sys.executable, "-m", "pytest", str(Path(__file__).resolve())])
    )

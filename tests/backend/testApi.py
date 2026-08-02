from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from llm.rag import defaultVectorDbStore, ingestVectorDb
from backend.app import app

from fastapi.testclient import TestClient


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


if __name__ == "__main__":
    import subprocess

    raise SystemExit(
        subprocess.call([sys.executable, "-m", "pytest", str(Path(__file__).resolve())])
    )

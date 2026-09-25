#!/usr/bin/env python3
"""Fixed-operation bridge used only by the isolated Agent Control memory experiment."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sqlite3
import tempfile
from pathlib import Path
from typing import Any

from marm_mcp_server import __version__
from marm_mcp_server.core.memory import MARMMemory


def atomic_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def database_stats(db_path: Path) -> dict[str, Any]:
    with sqlite3.connect(db_path) as connection:
        memory_count = connection.execute("SELECT COUNT(*) FROM memories").fetchone()[0]
        embedded_count = connection.execute(
            "SELECT COUNT(*) FROM memories WHERE embedding IS NOT NULL"
        ).fetchone()[0]
        compacted_sources = connection.execute(
            "SELECT COUNT(*) FROM memories WHERE compaction_role = 'source'"
        ).fetchone()[0]
        summaries = connection.execute(
            "SELECT COUNT(*) FROM memories WHERE compaction_role = 'summary'"
        ).fetchone()[0]
    return {
        "databaseBytes": db_path.stat().st_size if db_path.exists() else 0,
        "memoryCount": memory_count,
        "embeddedCount": embedded_count,
        "compactedSourceCount": compacted_sources,
        "compactionSummaryCount": summaries,
    }


async def ingest(memory: MARMMemory, payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    await memory.start_write_queue()
    try:
        for item in payload.get("memories", []):
            memory_id = await memory.console_create_memory(
                content=str(item["content"]),
                session=str(item["session"]),
                context_type=str(item.get("contextType", "general")),
                metadata=dict(item.get("metadata", {})),
                project=item.get("project"),
                platform=item.get("platform"),
            )
            row = memory.console_memory_row(memory_id)
            rows.append(
                {
                    "requestId": item.get("id"),
                    "memoryId": memory_id,
                    "contentHash": row["content_hash"] if row else None,
                    "hasEmbedding": bool(row and row["has_embedding"]),
                    "project": row["project"] if row else None,
                    "platform": row["platform"] if row else None,
                }
            )
    finally:
        await memory.stop_write_queue()
    return rows


async def recall(memory: MARMMemory, payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for query in payload.get("queries", []):
        results = await memory.recall_similar(
            str(query["query"]),
            session=query.get("session"),
            limit=int(query.get("limit", 5)),
            exact_mode=str(query.get("exactMode", "auto")),
            project=query.get("project"),
            platform=query.get("platform"),
        )
        rows.append(
            {
                "id": query["id"],
                "results": [
                    {
                        "memoryId": result["id"],
                        "content": result["content"],
                        "metadata": result.get("metadata", {}),
                        "project": result.get("project"),
                        "platform": result.get("platform"),
                        "score": result.get("similarity"),
                        "retrievalMode": result.get("retrieval_mode", "semantic"),
                    }
                    for result in results
                ],
            }
        )
    return rows


async def run(args: argparse.Namespace) -> None:
    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    db_path = Path(args.db).resolve()
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    memory = MARMMemory(str(db_path))
    if args.operation == "ingest":
        result = await ingest(memory, payload)
    elif args.operation == "recall":
        result = await recall(memory, payload)
    else:
        result = []
    atomic_json(
        output_path,
        {
            "schema": "agent-control.marm-experiment-backend/v1",
            "operation": args.operation,
            "marmVersion": __version__,
            "result": result,
            "stats": database_stats(db_path),
        },
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--operation", choices=("ingest", "recall", "stats"), required=True)
    parser.add_argument("--db", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    main()

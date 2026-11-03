from pathlib import Path

import pytest

from app.services.storage.base import StorageProvider
from app.services.storage.local import LocalDiskStorage


@pytest.mark.asyncio
async def test_local_disk_storage_saves_and_deletes_file(tmp_path):
    storage = LocalDiskStorage(str(tmp_path / "uploads"))

    saved_path = Path(await storage.save(b"requirement body", "Requirements.TXT"))

    assert isinstance(storage, StorageProvider)
    assert saved_path.parent == (tmp_path / "uploads").resolve()
    assert saved_path.suffix == ".txt"
    assert saved_path.read_bytes() == b"requirement body"

    await storage.delete(str(saved_path))
    assert not saved_path.exists()

    # Deleting an already-removed object is deliberately idempotent.
    await storage.delete(str(saved_path))

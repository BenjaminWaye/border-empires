import importlib.machinery
import io
from pathlib import Path
import tarfile
import tempfile
import unittest


publisher = importlib.machinery.SourceFileLoader(
    "publish_client", str(Path(__file__).resolve().parents[1] / "bin/publish-client")
).load_module()


def archive(sha, extra=None):
    files = {
        "index.html": '<html><script src="/assets/game.js"></script></html>',
        "admin.html": "<html>admin</html>",
        "assets/game.js": "console.log('game')",
        "__build_sha.txt": sha,
    }
    files.update(extra or {})
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w:gz") as bundle:
        for name, value in files.items():
            member = tarfile.TarInfo(name)
            data = value.encode()
            member.size = len(data)
            bundle.addfile(member, io.BytesIO(data))
    stream.seek(0)
    return stream


class PublishClientTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.sha = "a" * 40

    def test_complete_release_switches_atomically_and_retains_previous(self):
        publisher.publish(self.root, self.sha, archive(self.sha))
        original = (self.root / "current").resolve()
        second = "b" * 40
        publisher.publish(self.root, second, archive(second))
        self.assertEqual((self.root / "current/__build_sha.txt").read_text(), second)
        self.assertEqual((self.root / "previous").resolve(), original)
        publisher.activate(self.root, original)
        self.assertEqual((self.root / "current/__build_sha.txt").read_text(), self.sha)

    def test_bad_sha_does_not_replace_the_working_client(self):
        publisher.publish(self.root, self.sha, archive(self.sha))
        original = (self.root / "current").resolve()
        with self.assertRaisesRegex(ValueError, "SHA"):
            publisher.publish(self.root, "b" * 40, archive(self.sha))
        self.assertEqual((self.root / "current").resolve(), original)
        self.assertFalse(list((self.root / "releases").glob(".upload-*")))

    def test_missing_hashed_asset_is_not_published(self):
        with self.assertRaisesRegex(ValueError, "missing asset"):
            publisher.publish(self.root, self.sha, archive(self.sha, {
                "index.html": '<html><script src="/assets/missing.js"></script></html>'
            }))
        self.assertFalse((self.root / "current").exists())

    def test_archive_cannot_write_outside_the_release(self):
        with self.assertRaisesRegex(ValueError, "escapes"):
            publisher.publish(self.root, self.sha, archive(self.sha, {"../outside": "bad"}))
        self.assertFalse((self.root / "releases/outside").exists())

    def test_archive_cannot_introduce_symlinks(self):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode="w:gz") as bundle:
            member = tarfile.TarInfo("secret")
            member.type = tarfile.SYMTYPE
            member.linkname = "/etc/border-empires/secrets.env"
            bundle.addfile(member)
        stream.seek(0)
        with self.assertRaisesRegex(ValueError, "links"):
            publisher.publish(self.root, self.sha, stream)

    def test_release_storage_is_bounded(self):
        for number in range(6):
            sha = str(number) * 40
            publisher.publish(self.root, sha, archive(sha))
        self.assertEqual(len(list((self.root / "releases").iterdir())), 3)


if __name__ == "__main__":
    unittest.main()

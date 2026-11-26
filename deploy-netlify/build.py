from pathlib import Path
from shutil import copyfile
import stat, hashlib, json, io, subprocess, tarfile
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
output = root / "deploy-netlify" / "build"
public = output / "public"
public.mkdir(parents=True, exist_ok=True)
functions = output / "functions"
functions.mkdir(exist_ok=True)
bundle = functions / "ai.zip"
modules = ["rules.mjs", "adjudication.mjs", "game.mjs"]
for name in ["app.mjs", "style.css", *modules]:
    copyfile(root / name, public / name)

html = (root / "index.html").read_text(encoding="utf-8-sig")
html = html.replace('max="60000"', 'max="12000"').replace('max="64"', 'max="2"').replace('max="1024"', 'max="128"')
html = html.replace('高级搜索参数</summary>', '高级搜索参数</summary><p>在线版最多搜索 12 秒，使用 2 线程和 128 MB Hash。</p>')
(public / "index.html").write_text(html, encoding="utf-8")
(public / "_redirects").write_text("/api/ai /.netlify/functions/ai 200\n", encoding="ascii")
(public / "_headers").write_text("/*\n  X-Content-Type-Options: nosniff\n", encoding="ascii")
(public / "pikafish-source.txt").write_text(
    "Pikafish 2026-09-06, GNU GPL v3\n"
    "Exact upstream source: https://github.com/official-pikafish/Pikafish/tree/Pikafish-2026-09-06\n"
    "Upstream distribution: https://github.com/official-pikafish/Pikafish/releases/tag/Pikafish-2026-09-06\n",
    encoding="utf-8",
)
for name in ["Copying.txt", "NNUE-License.md", "AUTHORS"]:
    copyfile(root / "engine" / name, public / ("pikafish-" + name))

binary = "engine/Pikafish-Linux-x86-64-universal"
entries = {name: root / name for name in [
    *modules, "engine.mjs", binary, "engine/pikafish.nnue",
    "engine/Copying.txt", "engine/NNUE-License.md", "engine/AUTHORS",
]}
entries["ai.js"] = root / "deploy-netlify" / "ai.js"
network = entries.pop("engine/pikafish.nnue").read_bytes()
digest = hashlib.sha256(network).hexdigest()
part_name = f"nnue-{digest[:16]}.bin"
part_size = 8 * 1024 * 1024
(public / part_name).write_bytes(network[-part_size:])
def ubuntu_runtime():
    package = (root / "deploy-netlify" / "runtime" / "libc6.deb").read_bytes()
    assert package[:8] == b"!<arch>\n"
    offset = 8
    while offset < len(package):
        name = package[offset:offset+16].decode().strip().rstrip("/")
        size = int(package[offset+48:offset+58])
        payload = package[offset+60:offset+60+size]
        if name.startswith("data.tar"):
            break
        offset += 60 + size + size % 2
    else:
        raise ValueError("Debian package data missing")
    if name.endswith(".zst"):
        payload = subprocess.run(
            ["node", "-e", "process.stdout.write(require('node:zlib').zstdDecompressSync(require('node:fs').readFileSync(0)))"],
            input=payload, capture_output=True, check=True,
        ).stdout
    required = {"ld-linux-x86-64.so.2", "libc.so.6", "libm.so.6", "copyright"}
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:*") as data:
        files = {}
        for member in data.getmembers():
            name = Path(member.name).name
            if member.isfile() and name in required:
                files[name] = data.extractfile(member).read()
    assert required <= files.keys(), required - files.keys()
    return files

runtime_files = ubuntu_runtime()
copyfile(root / "deploy-netlify" / "runtime" / "source.txt", public / "glibc-source.txt")
(public / "glibc-copyright.txt").write_bytes(runtime_files.pop("copyright"))
with ZipFile(bundle, "w", compression=ZIP_DEFLATED) as archive:
    for name, data in runtime_files.items():
        archive.writestr("runtime/" + name, data)
    for name, source in entries.items():
        info = ZipInfo(name)
        info.create_system = 3
        info.external_attr = (stat.S_IFREG | (0o755 if name == binary else 0o644)) << 16
        archive.writestr(info, source.read_bytes(), compress_type=ZIP_DEFLATED)
    archive.writestr("package.json", '{"type":"commonjs"}')
    archive.writestr("engine/pikafish.nnue.part", network[:-part_size])
    archive.writestr("model.json", json.dumps({
        "part": part_name, "partSize": part_size, "sha256": digest,
    }))
with ZipFile(bundle) as archive:
    assert archive.testzip() is None
    rebuilt = archive.read("engine/pikafish.nnue.part") + (public / part_name).read_bytes()
    assert hashlib.sha256(rebuilt).hexdigest() == digest
assert (bundle).stat().st_size < 50_000_000
print(f"Static assets: {public}")
print(f"Function: {bundle} ({(bundle).stat().st_size:,} bytes)")

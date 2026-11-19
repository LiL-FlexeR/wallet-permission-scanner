"""Inspect every saved runtime layer without extracting archive paths."""
import json
import sys
import tarfile

archive_path, marker = sys.argv[1:]
sentinel = marker.encode()
layers_checked = 0
with tarfile.open(archive_path) as archive:
    manifest = json.load(archive.extractfile("manifest.json"))
    for image in manifest:
        config = archive.extractfile(image["Config"]).read()
        if sentinel in config:
            raise SystemExit("Credential sentinel found in image configuration/history")
        for layer_path in image["Layers"]:
            with tarfile.open(fileobj=archive.extractfile(layer_path), mode="r|*") as layer:
                layers_checked += 1
                for entry in layer:
                    name = entry.name.removeprefix("./")
                    if name.startswith("app/") and "/node_modules/" not in name:
                        if any(part.startswith(".env") or part.endswith(".env") or part in (".git", ".npmrc") for part in name.split("/")):
                            raise SystemExit("Environment/credential file found in application layer")
                    if not entry.isfile():
                        continue
                    stream = layer.extractfile(entry)
                    tail = b""
                    while chunk := stream.read(128 * 1024):
                        data = tail + chunk
                        if sentinel in data:
                            raise SystemExit("Credential sentinel found in runtime layer")
                        tail = data[-len(sentinel):]
if not layers_checked:
    raise SystemExit("No runtime layers inspected")
print(f"Image audit passed: {layers_checked} runtime layers; sentinel and application environment files absent.")

"""Generate the distributable dependency manifest without reading user data."""
from __future__ import annotations

import hashlib
import importlib.metadata
import json
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).parent
OUTPUT = ROOT / "release-metadata"
LOCK = ROOT / "requirements.lock"


def main() -> int:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    licenses = OUTPUT / "licenses"
    licenses.mkdir(parents=True)
    packages = []
    for raw in LOCK.read_text(encoding="utf-8").splitlines():
        if not raw or raw.startswith("#"):
            continue
        name, version = raw.split("==", 1)
        distribution = importlib.metadata.distribution(name)
        if distribution.version != version:
            raise RuntimeError(f"LOCK_MISMATCH: {name} {distribution.version} != {version}")
        license_files = []
        for file in distribution.files or []:
            file_name = pathlib.PurePosixPath(str(file)).name.lower()
            if not (file_name.startswith("license") or file_name.startswith("copying")):
                continue
            source = pathlib.Path(distribution.locate_file(file))
            if not source.is_file():
                continue
            destination = licenses / f"{name}-{version}-{source.name}"
            shutil.copy2(source, destination)
            license_files.append(destination.name)
        packages.append({
            "name": name,
            "version": version,
            "license": distribution.metadata.get("License", "not declared"),
            "homepage": distribution.metadata.get("Home-page", ""),
            "licenseFiles": sorted(set(license_files)),
        })
    payload = {
        "component": "fishtongue-analysis",
        "python": sys.version.split()[0],
        "protocolVersion": 1,
        "packages": packages,
    }
    manifest = OUTPUT / "analysis-sbom.json"
    manifest.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    digest = hashlib.sha256(manifest.read_bytes()).hexdigest()
    (OUTPUT / "analysis-sbom.sha256").write_text(
        f"{digest}  analysis-sbom.json\n", encoding="ascii"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

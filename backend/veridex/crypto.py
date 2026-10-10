"""Deterministic canonicalization (veridex-c14n-v1), SHA-256 hashing and Ed25519 attestation signing."""
import base64
import hashlib
import json
import math
import os
import unicodedata

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

CANON_VERSION = "veridex-c14n-v1"
CANON_RULES = [
    "UTF-8 JSON, object keys sorted lexicographically by code point",
    "No insignificant whitespace (separators ',' and ':')",
    "All strings and keys Unicode NFC-normalized",
    "Allowed types: object, array, string, integer, boolean, null",
    "Floats, NaN and Infinity are rejected (encode decimals as strings)",
    "Digest: SHA-256 over canonical bytes, formatted 'sha256:<64 lowercase hex>'",
]


class CanonicalizationError(ValueError):
    pass


def _normalize(value, path="$"):
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            raise CanonicalizationError(f"{path}: NaN/Infinity not allowed")
        raise CanonicalizationError(f"{path}: floats not allowed, encode as string")
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, list):
        return [_normalize(v, f"{path}[{i}]") for i, v in enumerate(value)]
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if not isinstance(k, str):
                raise CanonicalizationError(f"{path}: object keys must be strings")
            nk = unicodedata.normalize("NFC", k)
            if nk in out:
                raise CanonicalizationError(f"{path}: duplicate key after NFC normalization: {nk}")
            out[nk] = _normalize(v, f"{path}.{nk}")
        return out
    raise CanonicalizationError(f"{path}: unsupported type {type(value).__name__}")


def canonicalize(obj) -> bytes:
    return json.dumps(
        _normalize(obj), sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    ).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def hash_obj(obj) -> str:
    return sha256_hex(canonicalize(obj))


def build_manifest(release: dict, evidence: list) -> dict:
    return {
        "schema": "veridex.release-manifest.v1",
        "canonicalization": CANON_VERSION,
        "release": {
            "id": release["_id"],
            "project_id": release["project_id"],
            "version": release["version"],
            "commit": release["commit"],
        },
        "evidence": sorted(
            [{"id": e["_id"], "type": e["type"], "hash": e["hash"]} for e in evidence], key=lambda x: x["id"]
        ),
    }


def _private_key() -> Ed25519PrivateKey:
    return Ed25519PrivateKey.from_private_bytes(bytes.fromhex(os.environ["ATTESTOR_SIGNING_KEY"]))


def public_key_hex() -> str:
    return _private_key().public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    ).hex()


def key_id() -> str:
    return "ed25519:" + hashlib.sha256(bytes.fromhex(public_key_hex())).hexdigest()[:16]


def sign(data: bytes) -> str:
    return base64.b64encode(_private_key().sign(data)).decode()


def verify_signature(pub_hex: str, data: bytes, sig_b64: str) -> bool:
    try:
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(pub_hex)).verify(base64.b64decode(sig_b64), data)
        return True
    except (InvalidSignature, ValueError):
        return False

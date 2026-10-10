"""Unit tests for canonicalization, hashing, signing and drift comparison (no network). Run: pytest backend/tests"""
import os
import sys
from pathlib import Path

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "veridex_unit")
os.environ.setdefault("ATTESTOR_SIGNING_KEY", "11" * 32)
os.environ.setdefault("STALE_AFTER_MINUTES", "60")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from veridex.chains import b58encode  # noqa: E402
from veridex.crypto import (CanonicalizationError, canonicalize, hash_obj, public_key_hex, sign,  # noqa: E402
                            verify_signature)
from veridex.drift import compare, overall  # noqa: E402


def test_key_order_and_whitespace_independent():
    assert canonicalize({"b": 1, "a": [1, 2]}) == b'{"a":[1,2],"b":1}'
    assert hash_obj({"b": 1, "a": 2}) == hash_obj({"a": 2, "b": 1})


def test_known_vector():
    assert hash_obj({}) == "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"


def test_unicode_nfc():
    assert hash_obj({"k": "e\u0301"}) == hash_obj({"k": "\u00e9"})


@pytest.mark.parametrize("bad", [{"x": 1.5}, {"x": float("nan")}, {1: "a"}, {"x": object()}])
def test_rejects_non_canonical(bad):
    with pytest.raises(CanonicalizationError):
        canonicalize(bad)


def test_change_detected():
    assert hash_obj({"passed": 412, "failed": 0}) != hash_obj({"passed": 412, "failed": 3})


def test_signature_roundtrip_and_tamper():
    msg = canonicalize({"a": 1})
    sig = sign(msg)
    assert verify_signature(public_key_hex(), msg, sig)
    assert not verify_signature(public_key_hex(), canonicalize({"a": 2}), sig)


def _obs(mode, **fields):
    return {"mode": mode, "error": "timeout" if mode == "UNAVAILABLE" else None,
            "fields": {k: {"value": v, "status": "OBSERVED", "source": "test"} for k, v in fields.items()}}


def test_compare_match_mismatch():
    exp = {"implementation": "0xAA", "owner": "0xbb"}
    res = compare(exp, _obs("LIVE", implementation="0xaa", owner="0xcc"))
    st = {r["field"]: r["status"] for r in res}
    assert st == {"implementation": "MATCH", "owner": "MISMATCH"}
    assert overall(res, "LIVE") == "DRIFT"
    assert next(r for r in res if r["field"] == "owner")["severity"] == "HIGH"


def test_unavailable_is_not_drift():
    res = compare({"code_hash": "0x1"}, _obs("UNAVAILABLE"))
    assert res[0]["status"] == "UNAVAILABLE"
    assert overall(res, "UNAVAILABLE") == "UNAVAILABLE"


def test_unsupported_field_partial():
    o = _obs("LIVE", chain_id="1")
    o["fields"]["owner"] = {"value": None, "status": "UNSUPPORTED", "source": "reverted"}
    res = compare({"chain_id": "1", "owner": "0x1"}, o)
    assert overall(res, "LIVE") == "PARTIAL"


def test_b58():
    assert b58encode(b"\x00" * 32) == "1" * 32

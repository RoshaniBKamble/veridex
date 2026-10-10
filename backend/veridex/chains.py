"""Blockchain adapter layer: EVM JSON-RPC, Solana JSON-RPC and a clearly-labelled simulated demo chain."""
import base64
import os
import time
from urllib.parse import urlparse

import httpx
from eth_hash.auto import keccak

from .core import db, now

EIP1967_IMPL = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
EIP1967_ADMIN = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"
SOLANA_CLUSTERS = {
    "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d": "mainnet-beta",
    "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG": "devnet",
    "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY": "testnet",
}

EVM_CHECKS = ["chain_id", "code_hash", "implementation", "implementation_code_hash", "proxy_admin", "owner"]
EVM_UNSUPPORTED = [
    "Source-to-bytecode reproducible build verification",
    "Non-EIP-1967 proxy storage layouts",
    "AccessControl role member enumeration",
    "Multisig signer-set / threshold inspection",
]
SOL_CHECKS = ["cluster", "executable", "loader", "program_data_address", "upgrade_authority", "last_deploy_slot"]
SOL_UNSUPPORTED = [
    "Program binary hash (full ProgramData download)",
    "Verified-build (solana-verify) comparison",
    "PDA / config-account authority enumeration",
]

NETWORKS = {
    "ethereum-mainnet": {"name": "Ethereum Mainnet", "family": "evm", "env": "ETHEREUM_RPC_URL", "expected": "1"},
    "base-mainnet": {"name": "Base Mainnet", "family": "evm", "env": "BASE_RPC_URL", "expected": "8453"},
    "arbitrum-one": {"name": "Arbitrum One", "family": "evm", "env": "ARBITRUM_RPC_URL", "expected": "42161"},
    "solana-mainnet": {"name": "Solana Mainnet-Beta", "family": "solana", "env": "SOLANA_RPC_URL", "expected": "mainnet-beta"},
    "veridex-demo-evm": {"name": "VERIDEX Demo EVM (simulated)", "family": "demo-evm", "env": None, "expected": "1337"},
}

AUTHORITY_FIELDS = {"owner", "proxy_admin", "upgrade_authority", "implementation"}


class RpcError(Exception):
    pass


def rpc_url(network_id: str):
    env = NETWORKS[network_id]["env"]
    return os.environ.get(env, "").strip() if env else None


def safe_host(url: str) -> str:
    return urlparse(url).netloc if url else ""


async def rpc(url: str, method: str, params: list):
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    if r.status_code != 200:
        raise RpcError(f"HTTP {r.status_code} from RPC")
    data = r.json()
    if "error" in data:
        raise RpcError(str(data["error"].get("message", data["error"]))[:200])
    return data["result"]


def f(value, source, status="OBSERVED"):
    return {"value": value, "status": status, "source": source}


def _slot_addr(word: str):
    return None if int(word, 16) == 0 else "0x" + word[-40:].lower()


def _code_hash(code: str) -> str:
    if code in ("0x", "", None):
        return "none"
    return "0x" + keccak(bytes.fromhex(code[2:])).hex()


async def observe_evm(url: str, address: str) -> dict:
    chain_id = str(int(await rpc(url, "eth_chainId", []), 16))
    block = int(await rpc(url, "eth_blockNumber", []), 16)
    tag = hex(block)
    at = f"@ block {block}"
    code = await rpc(url, "eth_getCode", [address, tag])
    impl = _slot_addr(await rpc(url, "eth_getStorageAt", [address, EIP1967_IMPL, tag]))
    admin = _slot_addr(await rpc(url, "eth_getStorageAt", [address, EIP1967_ADMIN, tag]))
    fields = {
        "chain_id": f(chain_id, "eth_chainId"),
        "code_hash": f(_code_hash(code), f"keccak256(eth_getCode) {at}"),
        "implementation": f(impl or "none", f"eth_getStorageAt EIP-1967 impl slot {at}"),
        "proxy_admin": f(admin or "none", f"eth_getStorageAt EIP-1967 admin slot {at}"),
    }
    if impl:
        fields["implementation_code_hash"] = f(_code_hash(await rpc(url, "eth_getCode", [impl, tag])),
                                               f"keccak256(eth_getCode(implementation)) {at}")
    else:
        fields["implementation_code_hash"] = f("none", "not an EIP-1967 proxy", "OBSERVED")
    try:
        res = await rpc(url, "eth_call", [{"to": address, "data": "0x8da5cb5b"}, tag])
        if res and len(res) == 66:
            fields["owner"] = f("0x" + res[-40:].lower(), f"eth_call owner() {at}")
        else:
            fields["owner"] = f(None, "owner() returned no address", "UNSUPPORTED")
    except RpcError as e:
        fields["owner"] = f(None, f"owner() not implemented or reverted ({e})"[:160], "UNSUPPORTED")
    return {"block_ref": f"block {block}", "fields": fields}


_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58encode(b: bytes) -> str:
    n = int.from_bytes(b, "big")
    s = ""
    while n:
        n, r = divmod(n, 58)
        s = _B58[r] + s
    return "1" * (len(b) - len(b.lstrip(b"\0"))) + s


async def observe_solana(url: str, program_id: str) -> dict:
    genesis = await rpc(url, "getGenesisHash", [])
    cluster = SOLANA_CLUSTERS.get(genesis, f"unknown:{genesis[:10]}")
    slot = await rpc(url, "getSlot", [])
    at = f"@ slot {slot}"
    acc = await rpc(url, "getAccountInfo", [program_id, {"encoding": "jsonParsed", "commitment": "confirmed"}])
    fields = {"cluster": f(cluster, "getGenesisHash")}
    v = acc.get("value")
    if not v:
        fields["executable"] = f("account-not-found", f"getAccountInfo {at}")
        return {"block_ref": f"slot {slot}", "fields": fields}
    fields["executable"] = f(str(v["executable"]).lower(), f"getAccountInfo {at}")
    fields["loader"] = f(v["owner"], f"getAccountInfo.owner {at}")
    data = v.get("data")
    pd_addr = data.get("parsed", {}).get("info", {}).get("programData") if isinstance(data, dict) else None
    if not pd_addr:
        for k in ("program_data_address", "upgrade_authority", "last_deploy_slot"):
            fields[k] = f(None, "program is not owned by the upgradeable BPF loader", "UNSUPPORTED")
        return {"block_ref": f"slot {slot}", "fields": fields}
    fields["program_data_address"] = f(pd_addr, f"getAccountInfo.parsed.programData {at}")
    pd = await rpc(url, "getAccountInfo", [pd_addr, {"encoding": "base64", "dataSlice": {"offset": 0, "length": 45},
                                                     "commitment": "confirmed"}])
    raw = base64.b64decode(pd["value"]["data"][0])
    deploy_slot = int.from_bytes(raw[4:12], "little")
    authority = b58encode(raw[13:45]) if raw[12] == 1 else "none (immutable)"
    fields["upgrade_authority"] = f(authority, f"ProgramData header bytes[12..45] {at}")
    fields["last_deploy_slot"] = f(str(deploy_slot), f"ProgramData header bytes[4..12] {at}")
    return {"block_ref": f"slot {slot}", "fields": fields}


async def _record_status(network_id, ok: bool, latency_ms=None, error=None, ref=None):
    upd = {"last_check_at": now(), "last_error": error, "latency_ms": latency_ms}
    if ok:
        upd.update({"last_success_at": now(), "last_ref": ref, "last_error": None})
    await db.integration_status.update_one({"_id": network_id}, {"$set": upd}, upsert=True)


async def observe(deployment: dict) -> dict:
    """Return {mode, fields, block_ref, error, rpc_host}. Never raises for network failures."""
    nid = deployment["network"]
    net = NETWORKS[nid]
    if net["family"] == "demo-evm":
        st = await db.demo_chain_state.find_one({"_id": deployment["_id"]}) or {"fields": {}, "block": 0}
        fields = {k: f(v, f"simulated state store @ demo block {st['block']}") for k, v in st["fields"].items()}
        return {"mode": "SIMULATED", "fields": fields, "block_ref": f"demo block {st['block']}", "error": None,
                "rpc_host": "in-process simulator"}
    url = rpc_url(nid)
    if not url:
        return {"mode": "UNAVAILABLE", "fields": {}, "block_ref": None, "rpc_host": None,
                "error": f"{net['env']} is not configured"}
    t0 = time.monotonic()
    try:
        if net["family"] == "evm":
            res = await observe_evm(url, deployment["address"])
        else:
            res = await observe_solana(url, deployment["address"])
        await _record_status(nid, True, int((time.monotonic() - t0) * 1000), ref=res["block_ref"])
        return {"mode": "LIVE", "error": None, "rpc_host": safe_host(url), **res}
    except (RpcError, httpx.HTTPError, ValueError, KeyError, TypeError) as e:
        err = f"{type(e).__name__}: {e}"[:240]
        await _record_status(nid, False, error=err)
        return {"mode": "UNAVAILABLE", "fields": {}, "block_ref": None, "error": err, "rpc_host": safe_host(url)}


async def ping(network_id: str) -> dict:
    net = NETWORKS[network_id]
    if net["family"] == "demo-evm":
        return {"ok": True, "ref": "simulator"}
    url = rpc_url(network_id)
    if not url:
        return {"ok": False, "error": f"{net['env']} is not configured"}
    t0 = time.monotonic()
    try:
        if net["family"] == "evm":
            ident = str(int(await rpc(url, "eth_chainId", []), 16))
            ref = f"block {int(await rpc(url, 'eth_blockNumber', []), 16)}"
        else:
            ident = SOLANA_CLUSTERS.get(await rpc(url, "getGenesisHash", []), "unknown")
            ref = f"slot {await rpc(url, 'getSlot', [])}"
        lat = int((time.monotonic() - t0) * 1000)
        ok = ident == net["expected"]
        err = None if ok else f"Network identity mismatch: expected {net['expected']}, got {ident}"
        await _record_status(network_id, ok, lat, err, ref)
        return {"ok": ok, "identity": ident, "ref": ref, "latency_ms": lat, "error": err}
    except (RpcError, httpx.HTTPError, ValueError) as e:
        err = f"{type(e).__name__}: {e}"[:240]
        await _record_status(network_id, False, error=err)
        return {"ok": False, "error": err}


async def network_status_list() -> list:
    items = []
    for nid, net in NETWORKS.items():
        st = await db.integration_status.find_one({"_id": nid}) or {}
        demo = net["family"] == "demo-evm"
        url = rpc_url(nid)
        configured = demo or bool(url)
        if demo:
            label = "DEMO"
        elif not configured:
            label = "UNAVAILABLE"
        elif st.get("last_success_at") and not st.get("last_error"):
            label = "LIVE"
        elif st.get("last_error"):
            label = "UNAVAILABLE"
        else:
            label = "UNKNOWN"
        fam = net["family"]
        items.append({
            "id": nid, "name": net["name"], "family": fam, "label": label, "configured": configured,
            "env_var": net["env"], "rpc_host": safe_host(url) if url else None,
            "expected_identity": net["expected"],
            "last_check_at": st.get("last_check_at"), "last_success_at": st.get("last_success_at"),
            "last_ref": st.get("last_ref"), "last_error": st.get("last_error"), "latency_ms": st.get("latency_ms"),
            "supported_checks": SOL_CHECKS if fam == "solana" else EVM_CHECKS,
            "unsupported_checks": SOL_UNSUPPORTED if fam == "solana" else EVM_UNSUPPORTED,
            "setup": None if configured else f"Set {net['env']} in backend/.env to a JSON-RPC endpoint and restart the API.",
        })
    return items

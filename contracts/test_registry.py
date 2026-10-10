"""Unit tests for VeridexAttestationRegistry on an in-memory EVM (py-evm via eth-tester).
Run: (cd contracts && yarn install && node compile.js) && pytest contracts/"""
import json
from pathlib import Path

import pytest
from web3 import Web3
from eth_tester.exceptions import TransactionFailed
from web3.exceptions import ContractCustomError, ContractLogicError

ARTIFACT = Path(__file__).parent / "artifacts" / "VeridexAttestationRegistry.json"


@pytest.fixture(scope="module")
def compiled():
    return json.loads(ARTIFACT.read_text())


@pytest.fixture()
def env(compiled):
    w3 = Web3(Web3.EthereumTesterProvider())
    owner, attestor, stranger = w3.eth.accounts[:3]
    C = w3.eth.contract(abi=compiled["abi"], bytecode=compiled["bin"])
    tx = C.constructor(owner).transact({"from": owner})
    addr = w3.eth.get_transaction_receipt(tx).contractAddress
    return w3, w3.eth.contract(address=addr, abi=compiled["abi"]), owner, attestor, stranger


H = bytes.fromhex("11" * 32)
R = Web3.keccak(text="rel_demo")
REVERT = (ContractCustomError, ContractLogicError, TransactionFailed)


def test_owner_set(env):
    _, c, owner, *_ = env
    assert c.functions.owner().call() == owner


def test_unauthorized_register_reverts(env):
    _, c, _, attestor, _ = env
    with pytest.raises(REVERT):
        c.functions.register(H, R).transact({"from": attestor})


def test_only_owner_manages_attestors(env):
    _, c, _, attestor, stranger = env
    with pytest.raises(REVERT):
        c.functions.setAttestor(attestor, True).transact({"from": stranger})


def test_register_verify_and_retrieve(env):
    w3, c, owner, attestor, _ = env
    c.functions.setAttestor(attestor, True).transact({"from": owner})
    c.functions.register(H, R).transact({"from": attestor})
    valid, aid = c.functions.verify(H).call()
    assert valid
    assert aid == c.functions.computeId(H, R, attestor).call()
    rec = c.functions.getAttestation(aid).call()
    assert rec[0] == H and rec[1] == R and rec[2] == attestor and rec[3] > 0 and rec[4] is False


def test_duplicate_and_zero_rejected(env):
    _, c, owner, attestor, _ = env
    c.functions.setAttestor(attestor, True).transact({"from": owner})
    c.functions.register(H, R).transact({"from": attestor})
    with pytest.raises(REVERT):
        c.functions.register(H, R).transact({"from": attestor})
    with pytest.raises(REVERT):
        c.functions.register(b"\0" * 32, R).transact({"from": attestor})


def test_revoke_and_attestor_removal_invalidate(env):
    _, c, owner, attestor, stranger = env
    c.functions.setAttestor(attestor, True).transact({"from": owner})
    c.functions.register(H, R).transact({"from": attestor})
    _, aid = c.functions.verify(H).call()
    with pytest.raises(REVERT):
        c.functions.revoke(aid).transact({"from": stranger})
    c.functions.setAttestor(attestor, False).transact({"from": owner})
    assert c.functions.verify(H).call()[0] is False
    c.functions.setAttestor(attestor, True).transact({"from": owner})
    c.functions.revoke(aid).transact({"from": attestor})
    assert c.functions.verify(H).call()[0] is False
    with pytest.raises(REVERT):
        c.functions.revoke(aid).transact({"from": attestor})


def test_two_step_ownership(env):
    _, c, owner, attestor, stranger = env
    c.functions.transferOwnership(attestor).transact({"from": owner})
    with pytest.raises(REVERT):
        c.functions.acceptOwnership().transact({"from": stranger})
    c.functions.acceptOwnership().transact({"from": attestor})
    assert c.functions.owner().call() == attestor

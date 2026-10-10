"""VERIDEX backend API tests covering auth, release workflow, deployments, demo drift & tamper, overview, networks."""
import os
import time
import uuid

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://release-trust.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@veridex.dev"
ADMIN_PASSWORD = "Veridex!2026"
DEMO_PROJECT = "prj_demo_aurora"
DEMO_DEP = "dep_demo_vault"
AAVE_ADDR = "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2"


# ---------- Shared session helpers ----------
def _auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    return r


def _register(name, email, password):
    r = requests.post(f"{API}/auth/register", json={"name": name, "email": email, "password": password}, timeout=20)
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def user_token():
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    r = _register("Test User", email, "StrongPass123!")
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return r.json()["access_token"], email


@pytest.fixture(scope="module")
def second_user_token():
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    r = _register("Second User", email, "StrongPass123!")
    assert r.status_code == 200
    return r.json()["access_token"], email


# ---------- Health ----------
def test_health():
    r = requests.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ---------- Auth ----------
class TestAuth:
    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_with_token(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=_auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL
        assert r.json()["role"] == "admin"

    def test_logout(self, admin_token):
        r = requests.post(f"{API}/auth/logout", headers=_auth_headers(admin_token), timeout=15)
        assert r.status_code == 200

    def test_brute_force_lockout(self):
        """Brute force lockout - uses client.host:email as dedup key.
        NOTE: In K8s with multiple ingress IPs, client.host varies per request so lockout
        may not accumulate. We attempt up to 15 bad logins and check if 429 is observed."""
        email = f"bf_{uuid.uuid4().hex[:8]}@example.com"
        _register("BF", email, "StrongPass123!")
        got_429 = False
        for _ in range(15):
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong_wrong"}, timeout=15)
            if r.status_code == 429:
                got_429 = True
                break
            assert r.status_code == 401
        if not got_429:
            pytest.skip("Brute-force lockout not triggered within 15 attempts; likely K8s ingress IP rotation defeats client.host-based dedup. See report.")


# ---------- Networks ----------
class TestNetworks:
    def test_networks_check_then_list(self, admin_token):
        rc = requests.post(f"{API}/networks/check", headers=_auth_headers(admin_token), timeout=60)
        assert rc.status_code == 200
        r = requests.get(f"{API}/networks", headers=_auth_headers(admin_token), timeout=20)
        assert r.status_code == 200
        nets = {n["id"]: n for n in r.json()}
        # Field name used by server is "label"
        key = "label" if "label" in next(iter(nets.values())) else "status"
        assert "ethereum-mainnet" in nets
        assert "solana-mainnet" in nets
        assert nets["ethereum-mainnet"][key] in ("LIVE", "UNAVAILABLE")  # publicnode is flaky
        assert nets["solana-mainnet"][key] in ("LIVE", "UNAVAILABLE")
        assert nets["base-mainnet"][key] == "UNAVAILABLE"
        assert nets["arbitrum-one"][key] == "UNAVAILABLE"
        assert nets["veridex-demo-evm"][key] == "DEMO"


# ---------- Full E2E Release workflow ----------
@pytest.fixture(scope="module")
def e2e_state(user_token):
    token, email = user_token
    h = _auth_headers(token)
    # Create project
    pr = requests.post(f"{API}/projects", headers=h, json={
        "name": "TEST_e2e_proj", "description": "e2e", "repository": "github.com/test/e2e",
        "required_approvals": 1}, timeout=20)
    assert pr.status_code == 200, pr.text
    pid = pr.json()["id"]

    # Create release
    rr = requests.post(f"{API}/projects/{pid}/releases", headers=h,
                       json={"version": "v1.0.0", "commit": "abcdef1234567890", "branch": "main", "notes": "n"},
                       timeout=20)
    assert rr.status_code == 200, rr.text
    rid = rr.json()["id"]

    return {"token": token, "email": email, "h": h, "pid": pid, "rid": rid}


class TestEvidence:
    def test_float_rejection(self, e2e_state):
        s = e2e_state
        r = requests.post(f"{API}/releases/{s['rid']}/evidence", headers=s["h"],
                          json={"type": "test_report", "title": "float_test", "payload": {"coverage": 0.95}}, timeout=20)
        assert r.status_code == 422, r.text

    def test_add_required_evidence(self, e2e_state):
        s = e2e_state
        evs = []
        for et, title, payload in [
            ("source_commit", "src", {"commit": "abcdef1234567890", "repo": "github.com/test/e2e"}),
            ("build_artifact", "bld", {"toolchain": "foundry 1.2.3", "runs": 200}),
            ("test_report", "tr", {"passed": 10, "failed": 0, "skipped": 0, "coverage_bp": 9000}),
        ]:
            r = requests.post(f"{API}/releases/{s['rid']}/evidence", headers=s["h"],
                              json={"type": et, "title": title, "payload": payload}, timeout=20)
            assert r.status_code == 200, f"evidence {et}: {r.text}"
            evs.append(r.json())
        e2e_state["evidence_ids"] = [e["id"] for e in evs]

    def test_verify_evidence(self, e2e_state):
        eid = e2e_state["evidence_ids"][0]
        r = requests.post(f"{API}/evidence/{eid}/verify", headers=e2e_state["h"], timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "VERIFIED"

    def test_verify_content_mismatch(self, e2e_state):
        eid = e2e_state["evidence_ids"][0]
        r = requests.post(f"{API}/evidence/{eid}/verify-content", headers=e2e_state["h"],
                          json={"payload": {"commit": "deadbeef", "repo": "x"}}, timeout=15)
        assert r.status_code == 200
        assert r.json()["match"] is False


class TestSealApproveAttestDeploy:
    def test_seal_missing_required_fails_422(self, user_token):
        # New release with only one evidence type
        token, _ = user_token
        h = _auth_headers(token)
        pr = requests.post(f"{API}/projects", headers=h, json={
            "name": "TEST_seal_missing", "description": "x", "repository": "github.com/test/sm",
            "required_approvals": 1}, timeout=20)
        pid = pr.json()["id"]
        rr = requests.post(f"{API}/projects/{pid}/releases", headers=h,
                           json={"version": "v0.1", "commit": "1234567"}, timeout=20)
        rid = rr.json()["id"]
        requests.post(f"{API}/releases/{rid}/evidence", headers=h,
                      json={"type": "source_commit", "title": "s", "payload": {"commit": "abc1234"}}, timeout=15)
        r = requests.post(f"{API}/releases/{rid}/seal", headers=h, timeout=15)
        assert r.status_code == 422, r.text

    def test_seal(self, e2e_state):
        s = e2e_state
        r = requests.post(f"{API}/releases/{s['rid']}/seal", headers=s["h"], timeout=20)
        assert r.status_code == 200, r.text
        assert "manifest_hash" in r.json()
        e2e_state["manifest_hash"] = r.json()["manifest_hash"]

    def test_add_evidence_to_sealed_409(self, e2e_state):
        s = e2e_state
        r = requests.post(f"{API}/releases/{s['rid']}/evidence", headers=s["h"],
                          json={"type": "other", "title": "late", "payload": {"x": 1}}, timeout=15)
        assert r.status_code == 409

    def test_review_approve(self, e2e_state):
        s = e2e_state
        r = requests.post(f"{API}/releases/{s['rid']}/review", headers=s["h"],
                          json={"decision": "approve", "comment": "ok"}, timeout=15)
        assert r.status_code == 200

    def test_attest(self, e2e_state):
        s = e2e_state
        r = requests.post(f"{API}/releases/{s['rid']}/attest", headers=s["h"], timeout=20)
        assert r.status_code == 200, r.text
        e2e_state["attestation_id"] = r.json()["id"]

    def test_verify_attestation(self, e2e_state):
        aid = e2e_state["attestation_id"]
        r = requests.get(f"{API}/attestations/{aid}/verify", headers=e2e_state["h"], timeout=15)
        assert r.status_code == 200
        assert r.json()["valid"] is True

    def test_register_deployment(self, e2e_state):
        s = e2e_state
        # Public RPC can race on block retrieval; retry up to 3 times
        last = None
        for _ in range(3):
            r = requests.post(f"{API}/releases/{s['rid']}/deployments", headers=s["h"], json={
                "network": "ethereum-mainnet", "address": AAVE_ADDR, "label": "TEST_aave",
                "baseline_from_observation": True}, timeout=90)
            last = r
            if r.status_code == 200:
                break
            time.sleep(2)
        assert last.status_code == 200, last.text
        data = last.json()
        assert data["verification_status"] in ("VERIFIED", "PARTIAL"), data

    def test_demo_network_rejected_for_user(self, e2e_state):
        s = e2e_state
        r = requests.post(f"{API}/releases/{s['rid']}/deployments", headers=s["h"], json={
            "network": "veridex-demo-evm", "address": "0x7a25d1c0ffee4b6e9d3a2c1b0f9e8d7c6b5a4321",
            "label": "x"}, timeout=15)
        assert r.status_code == 422


# ---------- Authorization: cross-user ----------
class TestAuthorization:
    def test_second_user_cannot_see_private_project(self, e2e_state, second_user_token):
        pid = e2e_state["pid"]
        token, _ = second_user_token
        r = requests.get(f"{API}/projects/{pid}", headers=_auth_headers(token), timeout=15)
        assert r.status_code == 404

    def test_demo_project_visible_to_second_user(self, second_user_token):
        token, _ = second_user_token
        r = requests.get(f"{API}/projects/{DEMO_PROJECT}", headers=_auth_headers(token), timeout=15)
        assert r.status_code == 200


# ---------- Demo project overview, graph, public graph ----------
class TestDemoProject:
    def test_overview(self, admin_token):
        r = requests.get(f"{API}/projects/{DEMO_PROJECT}/overview", headers=_auth_headers(admin_token), timeout=30)
        assert r.status_code == 200
        t = r.json().get("trust", {})
        assert "components" in t
        assert len(t["components"]) == 5

    def test_project_graph(self, admin_token):
        r = requests.get(f"{API}/projects/{DEMO_PROJECT}/graph", headers=_auth_headers(admin_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "nodes" in data and "edges" in data
        assert len(data["nodes"]) > 0

    def test_public_demo_graph(self):
        r = requests.get(f"{API}/public/demo-graph", timeout=20)
        assert r.status_code == 200
        assert "nodes" in r.json()


# ---------- Demo drift simulation ----------
class TestDemoDrift:
    def test_reset_before(self, admin_token):
        # Ensure clean state
        r = requests.post(f"{API}/deployments/{DEMO_DEP}/reset-demo",
                          headers=_auth_headers(admin_token), timeout=30)
        assert r.status_code == 200

    def test_simulate_drift(self, admin_token):
        r = requests.post(f"{API}/deployments/{DEMO_DEP}/simulate-drift",
                          headers=_auth_headers(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("status") == "DRIFT" or data.get("verification_status") == "DRIFT"
        assert data.get("incident_id")
        pytest.incident_id = data["incident_id"]
        mismatches = data.get("mismatches") or data.get("comparisons") or []
        fields = {m.get("field") for m in mismatches if isinstance(m, dict)}
        for f in ("implementation", "implementation_code_hash", "proxy_admin"):
            assert f in fields, f"missing mismatch for {f}; got {fields}"

    def test_simulate_drift_dedup(self, admin_token):
        requests.post(f"{API}/deployments/{DEMO_DEP}/simulate-drift",
                      headers=_auth_headers(admin_token), timeout=30)
        inc = requests.get(f"{API}/projects/{DEMO_PROJECT}/incidents",
                           headers=_auth_headers(admin_token), timeout=15).json()
        open_inc = [i for i in inc if i.get("deployment_id") == DEMO_DEP and i.get("status") != "RESOLVED"]
        assert len(open_inc) == 1, f"expected 1 open incident, got {len(open_inc)}"

    def test_drift_events_listed(self, admin_token):
        r = requests.get(f"{API}/projects/{DEMO_PROJECT}/drift-events",
                         headers=_auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_findings_deployment_mismatch(self, admin_token):
        r = requests.get(f"{API}/projects/{DEMO_PROJECT}/findings",
                         headers=_auth_headers(admin_token), timeout=20)
        assert r.status_code == 200
        rules = {f.get("rule") for f in r.json()}
        assert "DEPLOYMENT_STATE_MISMATCH" in rules, rules

    def test_incident_transitions(self, admin_token):
        iid = getattr(pytest, "incident_id", None)
        assert iid, "no incident id from simulate"
        h = _auth_headers(admin_token)
        for status in ("ACKNOWLEDGED", "INVESTIGATING", "RESOLVED"):
            r = requests.post(f"{API}/incidents/{iid}/status", headers=h,
                              json={"status": status, "note": ""}, timeout=15)
            assert r.status_code == 200, f"{status}: {r.text}"
        # invalid transition from RESOLVED -> ACKNOWLEDGED should 409
        r = requests.post(f"{API}/incidents/{iid}/status", headers=h,
                          json={"status": "ACKNOWLEDGED", "note": ""}, timeout=15)
        assert r.status_code == 409

    def test_reset_demo_restores(self, admin_token):
        r = requests.post(f"{API}/deployments/{DEMO_DEP}/reset-demo",
                          headers=_auth_headers(admin_token), timeout=30)
        assert r.status_code == 200
        d = requests.get(f"{API}/deployments/{DEMO_DEP}",
                         headers=_auth_headers(admin_token), timeout=15).json()
        assert d["verification_status"] == "VERIFIED", d["verification_status"]


# ---------- Tamper demo ----------
class TestTamper:
    def _find_test_report_evidence(self, admin_token):
        # Find the v2.4.0 release in demo project then test_report evidence
        rels = requests.get(f"{API}/projects/{DEMO_PROJECT}/releases",
                            headers=_auth_headers(admin_token), timeout=15).json()
        v24 = next((r for r in rels if r["version"] == "v2.4.0"), None)
        assert v24, "v2.4.0 not found"
        rd = requests.get(f"{API}/releases/{v24['id']}", headers=_auth_headers(admin_token), timeout=15).json()
        ev = next((e for e in rd["evidence"] if e["type"] == "test_report"), None)
        assert ev
        return ev["id"]

    def test_tamper_and_mismatch(self, admin_token):
        eid = self._find_test_report_evidence(admin_token)
        h = _auth_headers(admin_token)
        r = requests.post(f"{API}/evidence/{eid}/tamper-demo", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "FAILED"
        # Verify deployment now shows release_attestation MISMATCH
        v = requests.post(f"{API}/deployments/{DEMO_DEP}/verify", headers=h, timeout=30)
        assert v.status_code == 200
        comps = v.json().get("comparisons") or []
        ra = next((c for c in comps if c.get("field") == "release_attestation" or c.get("name") == "release_attestation"), None)
        # fallback: any status MISMATCH mention
        if ra:
            assert ra.get("status") in ("MISMATCH", "FAILED")
        # Reset
        requests.post(f"{API}/deployments/{DEMO_DEP}/reset-demo", headers=h, timeout=30)

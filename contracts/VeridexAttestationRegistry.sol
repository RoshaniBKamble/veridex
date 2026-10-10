// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VeridexAttestationRegistry
/// @notice Anchors VERIDEX release-attestation hashes onchain. Only hashes are stored — never source code or secrets.
contract VeridexAttestationRegistry {
    struct Attestation {
        bytes32 evidenceHash;   // sha256 of the canonical attestation statement
        bytes32 releaseId;      // keccak256 of the VERIDEX release identifier
        address attestor;
        uint64 timestamp;
        bool revoked;
    }

    address public owner;
    address public pendingOwner;
    mapping(address => bool) public isAttestor;
    mapping(bytes32 => Attestation) private _attestations; // attestationId => record
    mapping(bytes32 => bytes32) public attestationOfHash;  // evidenceHash => attestationId

    error NotOwner();
    error NotPendingOwner();
    error NotAttestor();
    error ZeroValue();
    error AlreadyRegistered(bytes32 id);
    error UnknownAttestation(bytes32 id);
    error AlreadyRevoked(bytes32 id);

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AttestorUpdated(address indexed attestor, bool allowed);
    event AttestationRegistered(bytes32 indexed id, bytes32 indexed evidenceHash, bytes32 indexed releaseId, address attestor);
    event AttestationRevoked(bytes32 indexed id, address by);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAttestor() {
        if (!isAttestor[msg.sender]) revert NotAttestor();
        _;
    }

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroValue();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    /// @notice Two-step ownership transfer (Ownable2Step pattern).
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroValue();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    function setAttestor(address attestor, bool allowed) external onlyOwner {
        if (attestor == address(0)) revert ZeroValue();
        isAttestor[attestor] = allowed;
        emit AttestorUpdated(attestor, allowed);
    }

    function computeId(bytes32 evidenceHash, bytes32 releaseId, address attestor) public pure returns (bytes32) {
        return keccak256(abi.encode(evidenceHash, releaseId, attestor));
    }

    function register(bytes32 evidenceHash, bytes32 releaseId) external onlyAttestor returns (bytes32 id) {
        if (evidenceHash == bytes32(0) || releaseId == bytes32(0)) revert ZeroValue();
        if (attestationOfHash[evidenceHash] != bytes32(0)) revert AlreadyRegistered(attestationOfHash[evidenceHash]);
        id = computeId(evidenceHash, releaseId, msg.sender);
        _attestations[id] = Attestation(evidenceHash, releaseId, msg.sender, uint64(block.timestamp), false);
        attestationOfHash[evidenceHash] = id;
        emit AttestationRegistered(id, evidenceHash, releaseId, msg.sender);
    }

    function revoke(bytes32 id) external {
        Attestation storage a = _attestations[id];
        if (a.attestor == address(0)) revert UnknownAttestation(id);
        if (msg.sender != a.attestor && msg.sender != owner) revert NotAttestor();
        if (a.revoked) revert AlreadyRevoked(id);
        a.revoked = true;
        emit AttestationRevoked(id, msg.sender);
    }

    function getAttestation(bytes32 id) external view returns (Attestation memory) {
        if (_attestations[id].attestor == address(0)) revert UnknownAttestation(id);
        return _attestations[id];
    }

    /// @notice True when the hash is registered by a currently-authorised attestor and not revoked.
    function verify(bytes32 evidenceHash) external view returns (bool valid, bytes32 id) {
        id = attestationOfHash[evidenceHash];
        Attestation storage a = _attestations[id];
        valid = id != bytes32(0) && !a.revoked && isAttestor[a.attestor];
    }
}

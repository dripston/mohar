// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IssuerRegistry} from "./IssuerRegistry.sol";

/// @title CertificateRegistry
/// @notice Anchors certificate roots on chain and tracks their lifecycle. Holds hashes only, never personal data.
/// @dev Two ways in:
///      - `issue`: one document root, stored under `certId = keccak256(root)`.
///      - `issueBatch`: ONE root over many (documentRoot, expiresAt) leaves. Certificates in a batch are not
///        individually on chain; they prove membership with a Merkle proof. Their lifecycle state is created lazily
///        ("materialised") the first time the issuer revokes or suspends one.
///      Every record is namespaced by the issuing IDENTITY (the accredited institution, stable across key
///      rotation): single `rid = keccak256(identity, documentRoot)`, batch `key = keccak256(identity, batchRoot)`,
///      batch member `rid = keccak256(identity, batchRoot, documentRoot)`. A second (malicious) issuer who copies
///      a root out of the mempool therefore gets their own, separate record: they can neither block the honest
///      issuance (no `AlreadyAnchored` front-run) nor control the honest issuer's certificates.
///      Issuance is signed (EIP-712) by an accredited key and may be submitted by anyone (gasless relaying).
contract CertificateRegistry is EIP712 {
    enum Status {
        None,
        Active,
        Suspended,
        Revoked
    }

    /// @dev What a verifier should show. Precedence: Revoked > IssuerRevoked > Suspended > Expired > Active.
    enum State {
        NotFound,
        Active,
        Suspended,
        Revoked,
        Expired,
        IssuerRevoked
    }

    struct Cert {
        address signer; // key that signed the issuance
        address issuer; // accredited identity the key belonged to at issuance
        uint64 issuedAt;
        uint64 expiresAt; // 0 = never
        Status status;
        uint8 reason;
        uint64 updatedAt;
    }

    struct Batch {
        address signer;
        address issuer;
        uint64 issuedAt;
        uint32 count;
    }

    struct CertView {
        State state;
        Cert cert;
    }

    bytes32 private constant ISSUE_TYPEHASH =
        keccak256("Issue(address issuer,bytes32 root,uint64 expiresAt,uint256 nonce)");
    bytes32 private constant ISSUE_BATCH_TYPEHASH =
        keccak256("IssueBatch(address issuer,bytes32 batchRoot,uint32 count,uint256 nonce)");

    IssuerRegistry public immutable registry;

    bool public paused;
    mapping(address signer => uint256) public nonces;
    mapping(bytes32 rid => Cert) private _certs;
    mapping(bytes32 batchKey => Batch) private _batches;
    /// @dev short code -> first record that used it (O(1) lookup, so verifiers never scan event logs).
    mapping(bytes8 code => bytes32 rid) private _ridByCode;
    /// @dev set when a second, different document lands on an already-used 60-bit code. Lookup by code is then
    ///      ambiguous and verifiers must ask for the full link instead of guessing.
    mapping(bytes8 code => bool) private _codeClash;

    /// @dev `rid` is the identity-namespaced record id; `shortCode` derives from keccak256(documentRoot) only.
    event Issued(bytes32 indexed rid, bytes8 indexed shortCode, address indexed issuer, address signer, uint64 expiresAt);
    event BatchIssued(bytes32 indexed batchRoot, address indexed issuer, address signer, uint32 count);
    event StatusChanged(bytes32 indexed rid, Status status, uint8 reason, address by);
    event Paused(address by);
    event Unpaused(address by);

    error IsPaused();
    error NotRoot();
    error KeyNotActive();
    error BadSignature();
    error AlreadyAnchored();
    error BadExpiry();
    error EmptyBatch();
    error UnknownCert();
    error NotController();
    error BadTransition();
    error BadReason();
    error NotInBatch();
    error UnknownBatch();

    constructor(IssuerRegistry registry_) EIP712("Mohar", "1") {
        registry = registry_;
    }

    // ------------------------------------------------------------------ issuance

    /// @notice Anchor a single document root. `signer` must have signed `Issue(signer, root, expiresAt, nonces[signer])`.
    function issue(address signer, bytes32 root, uint64 expiresAt, bytes calldata sig) external returns (bytes32 id) {
        if (paused) revert IsPaused();
        uint64 nowTs = uint64(block.timestamp);
        if (expiresAt != 0 && expiresAt <= nowTs) revert BadExpiry();
        address identity = _authorise(signer, nowTs);

        id = recordId(identity, root);
        if (_certs[id].status != Status.None) revert AlreadyAnchored();

        bytes32 digest =
            _hashTypedDataV4(keccak256(abi.encode(ISSUE_TYPEHASH, signer, root, expiresAt, nonces[signer])));
        _checkSig(signer, digest, sig);
        nonces[signer]++;

        _certs[id] = Cert(signer, identity, nowTs, expiresAt, Status.Active, 0, nowTs);
        bytes8 code = _shortCode(certId(root));
        if (_ridByCode[code] == bytes32(0)) _ridByCode[code] = id;
        else _codeClash[code] = true;
        emit Issued(id, code, identity, signer, expiresAt);
    }

    /// @notice Anchor a Merkle root over `count` certificates in a single transaction.
    function issueBatch(address signer, bytes32 batchRoot, uint32 count, bytes calldata sig) external {
        if (paused) revert IsPaused();
        if (count == 0) revert EmptyBatch();
        uint64 nowTs = uint64(block.timestamp);
        address identity = _authorise(signer, nowTs);
        bytes32 key = batchKey(identity, batchRoot);
        if (_batches[key].issuedAt != 0) revert AlreadyAnchored();

        bytes32 digest =
            _hashTypedDataV4(keccak256(abi.encode(ISSUE_BATCH_TYPEHASH, signer, batchRoot, count, nonces[signer])));
        _checkSig(signer, digest, sig);
        nonces[signer]++;

        _batches[key] = Batch(signer, identity, nowTs, count);
        emit BatchIssued(batchRoot, identity, signer, count);
    }

    /// @notice Kill every signature this key has signed but not yet had submitted. Issuance is relayable by anyone,
    ///         so without this a signature the issuer changed their mind about would stay live forever.
    function invalidatePendingSignatures() external {
        nonces[msg.sender]++;
    }

    // ------------------------------------------------------------------ lifecycle (single or materialised certs)

    /// @notice Permanently revoke. Cannot be undone (suspend is the reversible one).
    function revoke(bytes32 rid, uint8 reason) external {
        _revoke(rid, reason);
    }

    function suspend(bytes32 rid) external {
        Cert storage c = _controlled(rid);
        if (c.status != Status.Active) revert BadTransition();
        _set(c, rid, Status.Suspended, 0);
    }

    function reinstate(bytes32 rid) external {
        Cert storage c = _controlled(rid);
        if (c.status != Status.Suspended) revert BadTransition();
        _set(c, rid, Status.Active, 0);
    }

    // ------------------------------------------------------------------ lifecycle for batch certificates

    function revokeFromBatch(
        bytes32 batchRoot,
        bytes32 documentRoot,
        uint64 expiresAt,
        bytes32[] calldata proof,
        uint8 reason
    ) external {
        _revoke(_materialise(registry.identityOf(msg.sender), batchRoot, documentRoot, expiresAt, proof), reason);
    }

    function suspendFromBatch(bytes32 batchRoot, bytes32 documentRoot, uint64 expiresAt, bytes32[] calldata proof)
        external
    {
        bytes32 rid = _materialise(registry.identityOf(msg.sender), batchRoot, documentRoot, expiresAt, proof);
        Cert storage c = _controlled(rid);
        if (c.status != Status.Active) revert BadTransition();
        _set(c, rid, Status.Suspended, 0);
    }

    // ------------------------------------------------------------------ pause (emergency stop for NEW issuance only)

    /// @notice Root can stop new issuance (e.g. a bug, or many keys compromised at once).
    /// @dev Deliberately does NOT block revoke / suspend / reinstate / reads: during an incident honest issuers
    ///      must still be able to revoke bad certificates, and verification must keep working.
    function pause() external {
        if (!registry.isRoot(msg.sender)) revert NotRoot();
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external {
        if (!registry.isRoot(msg.sender)) revert NotRoot();
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ------------------------------------------------------------------ views

    /// @notice Document-only id. Source of the human short code; NOT a storage key (see {recordId}).
    function certId(bytes32 documentRoot) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(documentRoot));
    }

    /// @notice Storage key of a single certificate, namespaced by the issuing identity.
    function recordId(address identity, bytes32 documentRoot) public pure returns (bytes32) {
        return keccak256(abi.encode(identity, documentRoot));
    }

    function batchKey(address identity, bytes32 batchRoot) public pure returns (bytes32) {
        return keccak256(abi.encode(identity, batchRoot));
    }

    /// @notice Storage key of a certificate inside an identity's batch.
    function batchRid(address identity, bytes32 batchRoot, bytes32 documentRoot) public pure returns (bytes32) {
        return keccak256(abi.encode(identity, batchRoot, documentRoot));
    }

    /// @notice Status of a single (or already materialised) certificate by record id.
    function getStatus(bytes32 rid)
        external
        view
        returns (address issuer, uint64 issuedAt, uint64 expiresAt, State state, uint8 reasonCode, uint64 revokedAt)
    {
        Cert memory c = _certs[rid];
        return (c.issuer, c.issuedAt, c.expiresAt, _state(c), c.reason, c.status == Status.Revoked ? c.updatedAt : 0);
    }

    function getCert(bytes32 rid) external view returns (CertView memory v) {
        v.cert = _certs[rid];
        v.state = _state(v.cert);
    }

    /// @notice Full status of a certificate that lives inside a batch. NotFound if the proof does not match.
    function getBatchCert(
        address identity,
        bytes32 batchRoot,
        bytes32 documentRoot,
        uint64 expiresAt,
        bytes32[] calldata proof
    ) external view returns (CertView memory v) {
        Batch memory b = _batches[batchKey(identity, batchRoot)];
        if (b.issuedAt == 0 || !verifyInBatch(batchRoot, documentRoot, expiresAt, proof)) return v;
        Cert memory c = _certs[batchRid(identity, batchRoot, documentRoot)];
        if (c.status == Status.None) c = Cert(b.signer, b.issuer, b.issuedAt, expiresAt, Status.Active, 0, b.issuedAt);
        v.cert = c;
        v.state = _state(c);
    }

    /// @notice Resolve a human short code. `ambiguous` means more than one certificate shares it: ask for the link.
    function resolveCode(bytes8 code) external view returns (bytes32 rid, bool ambiguous) {
        return (_ridByCode[code], _codeClash[code]);
    }

    function getBatch(address identity, bytes32 batchRoot) external view returns (Batch memory) {
        return _batches[batchKey(identity, batchRoot)];
    }

    /// @notice Is (documentRoot, expiresAt) a leaf of `batchRoot`? Same leaf layout as @mohar/core and OZ StandardMerkleTree.
    function verifyInBatch(bytes32 batchRoot, bytes32 documentRoot, uint64 expiresAt, bytes32[] calldata proof)
        public
        pure
        returns (bool)
    {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(documentRoot, expiresAt))));
        return MerkleProof.verifyCalldata(proof, batchRoot, leaf);
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ------------------------------------------------------------------ internals

    function _authorise(address signer, uint64 at) private view returns (address identity) {
        if (!registry.isKeyValidAt(signer, at)) revert KeyNotActive();
        identity = registry.identityOf(signer);
    }

    function _checkSig(address signer, bytes32 digest, bytes calldata sig) private pure {
        (address rec, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
        if (err != ECDSA.RecoverError.NoError || rec != signer) revert BadSignature();
    }

    function _shortCode(bytes32 id) private pure returns (bytes8) {
        return bytes8(id) & bytes8(0xFFFFFFFFFFFFFFF0);
    }

    function _materialise(
        address identity,
        bytes32 batchRoot,
        bytes32 documentRoot,
        uint64 expiresAt,
        bytes32[] calldata proof
    ) private returns (bytes32 rid) {
        Batch memory b = _batches[batchKey(identity, batchRoot)];
        if (b.issuedAt == 0) revert UnknownBatch();
        if (!verifyInBatch(batchRoot, documentRoot, expiresAt, proof)) revert NotInBatch();
        rid = batchRid(identity, batchRoot, documentRoot);
        if (_certs[rid].status == Status.None) {
            _certs[rid] = Cert(b.signer, b.issuer, b.issuedAt, expiresAt, Status.Active, 0, b.issuedAt);
        }
    }

    function _revoke(bytes32 rid, uint8 reason) private {
        if (reason < 1 || reason > 5) revert BadReason();
        Cert storage c = _controlled(rid);
        if (c.status == Status.Revoked) revert BadTransition();
        _set(c, rid, Status.Revoked, reason);
    }

    /// @dev The caller must be a currently valid key of the identity that issued the certificate.
    function _controlled(bytes32 rid) private view returns (Cert storage c) {
        c = _certs[rid];
        if (c.status == Status.None) revert UnknownCert();
        if (registry.identityOf(msg.sender) != c.issuer || !registry.isKeyValidAt(msg.sender, uint64(block.timestamp))) {
            revert NotController();
        }
    }

    function _set(Cert storage c, bytes32 rid, Status s, uint8 reason) private {
        c.status = s;
        c.reason = reason;
        c.updatedAt = uint64(block.timestamp);
        emit StatusChanged(rid, s, reason, msg.sender);
    }

    function _state(Cert memory c) private view returns (State) {
        if (c.status == Status.None) return State.NotFound;
        if (c.status == Status.Revoked) return State.Revoked;
        if (!registry.isKeyValidAt(c.signer, c.issuedAt)) return State.IssuerRevoked;
        if (c.status == Status.Suspended) return State.Suspended;
        if (c.expiresAt != 0 && block.timestamp >= c.expiresAt) return State.Expired;
        return State.Active;
    }
}

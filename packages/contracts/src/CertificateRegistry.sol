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
///      Records are keyed by `rid`: `certId` for single certificates, `keccak256(batchRoot, certId)` for batch
///      certificates. Binding the batch into the key stops a second (malicious) issuer from squatting on, or
///      revoking, somebody else's certificate by putting the same document root in their own batch.
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
    mapping(bytes32 batchRoot => Batch) private _batches;

    event Issued(
        bytes32 indexed certId, bytes8 indexed shortCode, address indexed issuer, address signer, uint64 expiresAt
    );
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

        id = keccak256(abi.encodePacked(root));
        if (_certs[id].status != Status.None) revert AlreadyAnchored();

        bytes32 digest =
            _hashTypedDataV4(keccak256(abi.encode(ISSUE_TYPEHASH, signer, root, expiresAt, nonces[signer])));
        _checkSig(signer, digest, sig);
        nonces[signer]++;

        _certs[id] = Cert(signer, identity, nowTs, expiresAt, Status.Active, 0, nowTs);
        emit Issued(id, _shortCode(id), identity, signer, expiresAt);
    }

    /// @notice Anchor a Merkle root over `count` certificates in a single transaction.
    function issueBatch(address signer, bytes32 batchRoot, uint32 count, bytes calldata sig) external {
        if (paused) revert IsPaused();
        if (count == 0) revert EmptyBatch();
        uint64 nowTs = uint64(block.timestamp);
        address identity = _authorise(signer, nowTs);
        if (_batches[batchRoot].issuedAt != 0) revert AlreadyAnchored();

        bytes32 digest =
            _hashTypedDataV4(keccak256(abi.encode(ISSUE_BATCH_TYPEHASH, signer, batchRoot, count, nonces[signer])));
        _checkSig(signer, digest, sig);
        nonces[signer]++;

        _batches[batchRoot] = Batch(signer, identity, nowTs, count);
        emit BatchIssued(batchRoot, identity, signer, count);
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
        _revoke(_materialise(batchRoot, documentRoot, expiresAt, proof), reason);
    }

    function suspendFromBatch(bytes32 batchRoot, bytes32 documentRoot, uint64 expiresAt, bytes32[] calldata proof)
        external
    {
        bytes32 rid = _materialise(batchRoot, documentRoot, expiresAt, proof);
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

    function certId(bytes32 documentRoot) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(documentRoot));
    }

    function batchRid(bytes32 batchRoot, bytes32 documentRoot) public pure returns (bytes32) {
        return keccak256(abi.encode(batchRoot, certId(documentRoot)));
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
    function getBatchCert(bytes32 batchRoot, bytes32 documentRoot, uint64 expiresAt, bytes32[] calldata proof)
        external
        view
        returns (CertView memory v)
    {
        Batch memory b = _batches[batchRoot];
        if (b.issuedAt == 0 || !verifyInBatch(batchRoot, documentRoot, expiresAt, proof)) return v;
        Cert memory c = _certs[batchRid(batchRoot, documentRoot)];
        if (c.status == Status.None) c = Cert(b.signer, b.issuer, b.issuedAt, expiresAt, Status.Active, 0, b.issuedAt);
        v.cert = c;
        v.state = _state(c);
    }

    function getBatch(bytes32 batchRoot) external view returns (Batch memory) {
        return _batches[batchRoot];
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

    function _materialise(bytes32 batchRoot, bytes32 documentRoot, uint64 expiresAt, bytes32[] calldata proof)
        private
        returns (bytes32 rid)
    {
        Batch memory b = _batches[batchRoot];
        if (b.issuedAt == 0) revert UnknownBatch();
        if (!verifyInBatch(batchRoot, documentRoot, expiresAt, proof)) revert NotInBatch();
        rid = batchRid(batchRoot, documentRoot);
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

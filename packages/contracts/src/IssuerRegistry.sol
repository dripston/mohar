// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title IssuerRegistry
/// @notice Who is allowed to issue Mohar certificates, and since/until when.
/// @dev Two layers on purpose:
///      - an *issuer identity* (a university): name + domain, accredited by the root authority;
///      - one or more *signing keys* that map to that identity.
///      A key can be revoked "as of" a timestamp, which invalidates certificates it issued after that
///      moment while leaving honest history intact. A rotated identity keeps control of old certificates.
///      No personal data lives here: names and domains of institutions only.
contract IssuerRegistry is AccessControl {
    /// @notice The accreditation body (demo: "AICTE"). Can accredit issuers, revoke keys, pause issuance.
    bytes32 public constant ROOT_AUTHORITY = keccak256("MOHAR_ROOT_AUTHORITY");

    // Reason codes shared with CertificateRegistry.
    uint8 public constant REASON_KEY_COMPROMISE = 1;
    uint8 public constant REASON_ISSUED_IN_ERROR = 2;
    uint8 public constant REASON_MISCONDUCT = 3;
    uint8 public constant REASON_SUPERSEDED = 4;
    uint8 public constant REASON_OTHER = 5;

    /// @dev What kind of body this issuer is. Schemes can require a credential to come from a specific type
    ///      (a caste certificate from a REVENUE_OFFICE, an enrolment certificate from an INSTITUTE).
    enum IssuerType {
        OTHER,
        INSTITUTE,
        REVENUE_OFFICE,
        EMPLOYER
    }

    struct Issuer {
        string name;
        string domain;
        uint64 registeredAt;
        /// @dev block time at which the root authority last confirmed the DNS TXT proof (0 = never).
        ///      Lets verifiers fall back to an on-chain answer when live DNS lookups fail.
        uint64 domainCheckedAt;
        bool exists;
        IssuerType issuerType;
        /// @dev Free text saying who vouches for this listing, e.g. "Ministry notified list (demo)". Set by root only.
        string accreditationSource;
    }

    struct Key {
        address issuer; // identity this key signs for
        uint64 revokedFrom; // 0 = active; otherwise certificates issued at or after this time are invalid
        uint8 reason;
        bool exists;
    }

    mapping(address identity => Issuer) private _issuers;
    mapping(address key => Key) private _keys;
    uint256 public rootCount;

    event IssuerRegistered(
        address indexed issuer, string name, string domain, bool domainChecked, IssuerType issuerType, string accreditationSource
    );
    event IssuerClassified(address indexed issuer, IssuerType issuerType, string accreditationSource);
    event DomainAttested(address indexed issuer, uint64 at);
    event KeyRevoked(address indexed key, address indexed issuer, uint64 effectiveFrom, uint8 reason);
    event KeyRotated(address indexed issuer, address indexed oldKey, address indexed newKey, uint64 at);

    error NotRoot();
    error AlreadyRegistered();
    error UnknownIssuer();
    error UnknownKey();
    error KeyAlreadyUsed();
    error BadReason();
    error CannotLoosenRevocation();
    error EmptyField();
    error LastRoot();

    constructor(address root) {
        require(root != address(0), "root=0");
        _setRoleAdmin(ROOT_AUTHORITY, ROOT_AUTHORITY);
        _grantRole(ROOT_AUTHORITY, root);
    }

    modifier onlyRoot() {
        if (!hasRole(ROOT_AUTHORITY, msg.sender)) revert NotRoot();
        _;
    }

    // ------------------------------------------------------------------ root actions

    /// @notice Accredit a new issuer. `domainChecked` records that the root already saw the DNS TXT proof.
    function registerIssuer(address issuer, string calldata domain, string calldata name, bool domainChecked)
        external
        onlyRoot
    {
        _register(issuer, domain, name, domainChecked, IssuerType.OTHER, "");
    }

    /// @notice Same as above, with the issuer's type and the source of the listing.
    function registerIssuer(
        address issuer,
        string calldata domain,
        string calldata name,
        bool domainChecked,
        IssuerType issuerType,
        string calldata accreditationSource
    ) external onlyRoot {
        _register(issuer, domain, name, domainChecked, issuerType, accreditationSource);
    }

    /// @notice Root reclassifies an issuer or corrects where its listing came from. Public, evented, root-only.
    function setIssuerType(address issuer, IssuerType issuerType, string calldata accreditationSource) external onlyRoot {
        if (!_issuers[issuer].exists) revert UnknownIssuer();
        if (bytes(accreditationSource).length > 120) revert EmptyField();
        _issuers[issuer].issuerType = issuerType;
        _issuers[issuer].accreditationSource = accreditationSource;
        emit IssuerClassified(issuer, issuerType, accreditationSource);
    }

    function _register(
        address issuer,
        string calldata domain,
        string calldata name,
        bool domainChecked,
        IssuerType issuerType,
        string memory accreditationSource
    ) private {
        if (issuer == address(0) || bytes(domain).length == 0 || bytes(name).length == 0) revert EmptyField();
        if (bytes(accreditationSource).length > 120) revert EmptyField();
        if (_issuers[issuer].exists || _keys[issuer].exists) revert AlreadyRegistered();
        uint64 nowTs = uint64(block.timestamp);
        _issuers[issuer] = Issuer(name, domain, nowTs, domainChecked ? nowTs : 0, true, issuerType, accreditationSource);
        _keys[issuer] = Key(issuer, 0, 0, true);
        emit IssuerRegistered(issuer, name, domain, domainChecked, issuerType, accreditationSource);
        if (domainChecked) emit DomainAttested(issuer, nowTs);
    }

    /// @notice Record that the root re-checked this issuer's DNS TXT record just now.
    function attestDomain(address issuer) external onlyRoot {
        if (!_issuers[issuer].exists) revert UnknownIssuer();
        _issuers[issuer].domainCheckedAt = uint64(block.timestamp);
        emit DomainAttested(issuer, uint64(block.timestamp));
    }

    /// @notice Revoke a signing key as of `effectiveFrom`. Certificates it issued BEFORE that time stay valid.
    /// @dev `effectiveFrom` may be in the past (the key was stolen earlier than we noticed) but a revocation can
    ///      only ever move earlier, never later: nobody can quietly "un-revoke" a key.
    function revokeIssuer(address key, uint64 effectiveFrom, uint8 reason) external onlyRoot {
        Key storage k = _keys[key];
        if (!k.exists) revert UnknownKey();
        if (reason < REASON_KEY_COMPROMISE || reason > REASON_OTHER) revert BadReason();
        if (effectiveFrom == 0) revert EmptyField();
        if (k.revokedFrom != 0 && effectiveFrom >= k.revokedFrom) revert CannotLoosenRevocation();
        k.revokedFrom = effectiveFrom;
        k.reason = reason;
        emit KeyRevoked(key, k.issuer, effectiveFrom, reason);
    }

    /// @notice Move an issuer identity to a new key. The old key is revoked from now; its past certificates
    ///         stay valid and the new key may manage them (revoke / suspend / reinstate).
    /// @dev Root-only on purpose: if the old key is the stolen one, it must not be able to rotate itself away.
    function rotateIssuerKey(address oldKey, address newKey) external onlyRoot {
        Key storage k = _keys[oldKey];
        if (!k.exists) revert UnknownKey();
        if (newKey == address(0) || _keys[newKey].exists || _issuers[newKey].exists) revert KeyAlreadyUsed();
        address identity = k.issuer;
        uint64 nowTs = uint64(block.timestamp);
        if (k.revokedFrom == 0 || k.revokedFrom > nowTs) {
            k.revokedFrom = nowTs;
            k.reason = REASON_SUPERSEDED;
            emit KeyRevoked(oldKey, identity, nowTs, REASON_SUPERSEDED);
        }
        _keys[newKey] = Key(identity, 0, 0, true);
        emit KeyRotated(identity, oldKey, newKey, nowTs);
    }

    // ------------------------------------------------------------------ views

    function isRoot(address a) external view returns (bool) {
        return hasRole(ROOT_AUTHORITY, a);
    }

    /// @notice Identity (accredited institution) a key signs for; address(0) if unknown.
    function identityOf(address key) external view returns (address) {
        return _keys[key].issuer;
    }

    /// @notice Was `key` allowed to issue at time `t`?
    function isKeyValidAt(address key, uint64 t) public view returns (bool) {
        Key storage k = _keys[key];
        return k.exists && (k.revokedFrom == 0 || t < k.revokedFrom);
    }

    function getIssuer(address identity) external view returns (Issuer memory) {
        return _issuers[identity];
    }

    function getKey(address key) external view returns (Key memory) {
        return _keys[key];
    }

    // ------------------------------------------------------------------ guard against locking ourselves out

    function _grantRole(bytes32 role, address account) internal override returns (bool granted) {
        granted = super._grantRole(role, account);
        if (granted && role == ROOT_AUTHORITY) rootCount++;
    }

    function _revokeRole(bytes32 role, address account) internal override returns (bool revoked) {
        revoked = super._revokeRole(role, account);
        if (revoked && role == ROOT_AUTHORITY) {
            if (rootCount == 1) revert LastRoot();
            rootCount--;
        }
    }
}

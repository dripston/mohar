// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IssuerRegistry} from "../src/IssuerRegistry.sol";
import {CertificateRegistry} from "../src/CertificateRegistry.sol";

/// @dev Shared fixture: a root authority, two accredited universities, helpers for EIP-712 signing and batch trees.
abstract contract Base is Test {
    IssuerRegistry internal reg;
    CertificateRegistry internal certs;

    address internal root = makeAddr("root");
    uint256 internal aliceKey = 0xA11CE;
    uint256 internal bobKey = 0xB0B;
    address internal alice; // university A
    address internal bob; // university B

    bytes32 internal constant ISSUE_TYPEHASH =
        keccak256("Issue(address issuer,bytes32 root,uint64 expiresAt,uint256 nonce)");
    bytes32 internal constant ISSUE_BATCH_TYPEHASH =
        keccak256("IssueBatch(address issuer,bytes32 batchRoot,uint32 count,uint256 nonce)");

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        alice = vm.addr(aliceKey);
        bob = vm.addr(bobKey);
        reg = new IssuerRegistry(root);
        certs = new CertificateRegistry(reg);
        vm.startPrank(root);
        reg.registerIssuer(alice, "acharya.ac.in", "Acharya Institute", true);
        reg.registerIssuer(bob, "bob.edu", "Bob University", false);
        vm.stopPrank();
    }

    // ------------------------------------------------------------- signing

    function _digest(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", certs.domainSeparator(), structHash));
    }

    function _signIssue(uint256 pk, bytes32 docRoot, uint64 expiresAt, uint256 nonce) internal view returns (bytes memory) {
        bytes32 h = _digest(keccak256(abi.encode(ISSUE_TYPEHASH, vm.addr(pk), docRoot, expiresAt, nonce)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, h);
        return abi.encodePacked(r, s, v);
    }

    function _signBatch(uint256 pk, bytes32 batchRoot, uint32 count, uint256 nonce) internal view returns (bytes memory) {
        bytes32 h = _digest(keccak256(abi.encode(ISSUE_BATCH_TYPEHASH, vm.addr(pk), batchRoot, count, nonce)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, h);
        return abi.encodePacked(r, s, v);
    }

    function _issue(uint256 pk, bytes32 docRoot, uint64 expiresAt) internal returns (bytes32 id) {
        address signer = vm.addr(pk);
        id = certs.issue(signer, docRoot, expiresAt, _signIssue(pk, docRoot, expiresAt, certs.nonces(signer)));
    }

    // ------------------------------------------------------------- merkle (OZ StandardMerkleTree layout)

    function _leaf(bytes32 docRoot, uint64 expiresAt) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(docRoot, expiresAt))));
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    /// @dev Builds a sorted-pair Merkle tree over the given leaves. Returns root and a proof for `index`.
    ///      Odd nodes are promoted unchanged, matching OZ MerkleProof semantics for a sorted-pair tree.
    function _tree(bytes32[] memory leaves, uint256 index) internal pure returns (bytes32 rootHash, bytes32[] memory proof) {
        uint256 n = leaves.length;
        bytes32[] memory level = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            level[i] = leaves[i];
        }
        bytes32[] memory tmp = new bytes32[](32);
        uint256 plen;
        uint256 idx = index;
        while (n > 1) {
            uint256 sib = idx ^ 1;
            if (sib < n) tmp[plen++] = level[sib];
            uint256 next = (n + 1) / 2;
            bytes32[] memory up = new bytes32[](next);
            for (uint256 i = 0; i < n / 2; i++) {
                up[i] = _hashPair(level[2 * i], level[2 * i + 1]);
            }
            if (n % 2 == 1) up[next - 1] = level[n - 1];
            level = up;
            n = next;
            idx /= 2;
        }
        rootHash = level[0];
        proof = new bytes32[](plen);
        for (uint256 i = 0; i < plen; i++) {
            proof[i] = tmp[i];
        }
    }
}

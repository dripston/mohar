// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {CertificateRegistry} from "../src/CertificateRegistry.sol";

/// @notice Review-pass regression tests (REVIEW.md). Each test failed on the pre-review contracts.
contract ReviewTest is Base {
    // ---------------------------------------------------------------- 1. root squatting

    /// Bob copies Alice's pending single root and lands first. Alice must still be able to issue, and Bob must
    /// not control (or even appear as the issuer of) Alice's certificate.
    function test_squat_singleRoot_cannotBlockOrHijack() public {
        bytes32 doc = keccak256("alice-cert");
        bytes memory aliceSig = _signIssue(aliceKey, doc, 0, certs.nonces(alice));
        _issue(bobKey, doc, 0); // front-run with the same root
        certs.issue(alice, doc, 0, aliceSig); // must not revert AlreadyAnchored

        bytes32 aliceRid = certs.recordId(alice, doc);
        (address issuer,,, CertificateRegistry.State s,,) = certs.getStatus(aliceRid);
        assertEq(issuer, alice);
        assertEq(uint8(s), uint8(CertificateRegistry.State.Active));

        // Bob's record is his own: he cannot touch Alice's.
        vm.prank(bob);
        vm.expectRevert(CertificateRegistry.NotController.selector);
        certs.revoke(aliceRid, 1);
        // and revoking his own record leaves Alice's untouched
        bytes32 bobRid = certs.recordId(bob, doc);
        vm.prank(bob);
        certs.revoke(bobRid, 1);
        (,,, s,,) = certs.getStatus(aliceRid);
        assertEq(uint8(s), uint8(CertificateRegistry.State.Active));
    }

    /// Same attack on a batch root: Bob anchors Alice's exact batchRoot first.
    function test_squat_batchRoot_cannotBlockOrHijack() public {
        bytes32[] memory docs = new bytes32[](3);
        bytes32[] memory leaves = new bytes32[](3);
        for (uint256 i = 0; i < 3; i++) {
            docs[i] = keccak256(abi.encode("alice-batch", i));
            leaves[i] = _leaf(docs[i], 0);
        }
        (bytes32 batchRoot, bytes32[] memory proof) = _tree(leaves, 0);

        bytes memory aliceSig = _signBatch(aliceKey, batchRoot, 3, certs.nonces(alice));
        certs.issueBatch(bob, batchRoot, 3, _signBatch(bobKey, batchRoot, 3, certs.nonces(bob))); // front-run
        certs.issueBatch(alice, batchRoot, 3, aliceSig); // must not revert

        CertificateRegistry.CertView memory v = certs.getBatchCert(alice, batchRoot, docs[0], 0, proof);
        assertEq(v.cert.issuer, alice);
        assertEq(uint8(v.state), uint8(CertificateRegistry.State.Active));

        // Bob cannot revoke Alice's batch certificate through his own batch record.
        vm.prank(bob);
        certs.revokeFromBatch(batchRoot, docs[0], 0, proof, 1);
        v = certs.getBatchCert(alice, batchRoot, docs[0], 0, proof);
        assertEq(uint8(v.state), uint8(CertificateRegistry.State.Active));
        v = certs.getBatchCert(bob, batchRoot, docs[0], 0, proof);
        assertEq(uint8(v.state), uint8(CertificateRegistry.State.Revoked));
    }

    // ---------------------------------------------------------------- 8. signatures

    /// A signed-but-unsubmitted issuance can be submitted by anyone, forever. The signer needs a way to kill it.
    function test_signer_canCancelPendingSignatures() public {
        bytes32 doc = keccak256("changed-my-mind");
        bytes memory sig = _signIssue(aliceKey, doc, 0, certs.nonces(alice));
        vm.prank(alice);
        certs.invalidatePendingSignatures();
        vm.expectRevert(CertificateRegistry.BadSignature.selector);
        certs.issue(alice, doc, 0, sig);
    }

    /// A key revoked back-dated to before now can never be used to land an old signature.
    function test_oldSignature_afterKeyRotation_isDead() public {
        bytes32 doc = keccak256("held-back-sig");
        bytes memory sig = _signIssue(aliceKey, doc, 0, certs.nonces(alice));
        address newKey = makeAddr("aliceNew");
        vm.prank(root);
        reg.rotateIssuerKey(alice, newKey);
        vm.expectRevert(CertificateRegistry.KeyNotActive.selector);
        certs.issue(alice, doc, 0, sig);
    }

    /// Signature made for one deployment/chain is rejected by another deployment of the same code.
    function test_signature_doesNotReplayAcrossContracts() public {
        CertificateRegistry other = new CertificateRegistry(reg);
        bytes32 doc = keccak256("cross-contract");
        bytes memory sig = _signIssue(aliceKey, doc, 0, certs.nonces(alice));
        vm.expectRevert(CertificateRegistry.BadSignature.selector);
        other.issue(alice, doc, 0, sig);
    }

    function test_signature_doesNotReplayAcrossChains() public {
        bytes32 doc = keccak256("cross-chain");
        bytes memory sig = _signIssue(aliceKey, doc, 0, certs.nonces(alice));
        vm.chainId(8453);
        vm.expectRevert(CertificateRegistry.BadSignature.selector);
        certs.issue(alice, doc, 0, sig);
    }

    function test_signature_cannotBeUsedTwiceOrWithTamperedFields() public {
        bytes32 doc = keccak256("once");
        bytes memory sig = _signIssue(aliceKey, doc, 0, certs.nonces(alice));
        certs.issue(alice, doc, 0, sig);
        vm.expectRevert(CertificateRegistry.AlreadyAnchored.selector);
        certs.issue(alice, doc, 0, sig); // replay of a landed signature is a no-op revert
        // and the nonce moved on, so the same bytes cannot authorise anything else
        assertEq(certs.nonces(alice), 1);
        bytes memory sig2 = _signIssue(aliceKey, keccak256("b"), 0, certs.nonces(alice));
        vm.expectRevert(CertificateRegistry.BadSignature.selector);
        certs.issue(alice, keccak256("b"), uint64(block.timestamp + 123), sig2); // expiry changed after signing
    }

    // ---------------------------------------------------------------- 7. time comes from the chain

    function test_issuedAt_isBlockTimestamp_notCallerControlled() public {
        vm.warp(1_900_000_000);
        bytes32 id = _issue(aliceKey, keccak256("t"), 0);
        // After this change the record is keyed by (identity, root).
        (, uint64 issuedAt,,,,) = certs.getStatus(certs.recordId(alice, keccak256("t")));
        assertEq(issuedAt, 1_900_000_000);
        id;
    }

    // ---------------------------------------------------------------- 12. short codes resolve on chain

    function test_code_resolvesWithoutLogScan_andFlagsClash() public {
        bytes32 doc = keccak256("code-doc");
        _issue(aliceKey, doc, 0);
        bytes8 code = bytes8(certs.certId(doc)) & bytes8(0xFFFFFFFFFFFFFFF0);
        (bytes32 rid, bool amb) = certs.resolveCode(code);
        assertEq(rid, certs.recordId(alice, doc));
        assertFalse(amb);

        // Bob issuing the same root (same code) makes the code ambiguous; the first record still resolves.
        _issue(bobKey, doc, 0);
        (rid, amb) = certs.resolveCode(code);
        assertEq(rid, certs.recordId(alice, doc));
        assertTrue(amb);
        (rid, amb) = certs.resolveCode(bytes8(uint64(0x1234)));
        assertEq(rid, bytes32(0));
        assertFalse(amb);
    }
}

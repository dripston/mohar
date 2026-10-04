// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {IssuerRegistry} from "../src/IssuerRegistry.sol";
import {CertificateRegistry} from "../src/CertificateRegistry.sol";

contract CertificatesTest is Base {
    bytes32 constant DOC = keccak256("doc-1");

    // ============================================================ issuer registry

    function test_registry_basics() public view {
        assertEq(reg.identityOf(alice), alice);
        assertTrue(reg.isKeyValidAt(alice, uint64(block.timestamp)));
        IssuerRegistry.Issuer memory i = reg.getIssuer(alice);
        assertEq(i.domain, "acharya.ac.in");
        assertEq(i.domainCheckedAt, block.timestamp);
        assertEq(reg.getIssuer(bob).domainCheckedAt, 0);
    }

    function test_onlyRoot_canRegister() public {
        vm.prank(alice);
        vm.expectRevert(IssuerRegistry.NotRoot.selector);
        reg.registerIssuer(makeAddr("x"), "x.edu", "X", false);
    }

    function test_cannotRegisterTwice() public {
        vm.prank(root);
        vm.expectRevert(IssuerRegistry.AlreadyRegistered.selector);
        reg.registerIssuer(alice, "a", "A", false);
    }

    function test_revokeIssuer_cutoff_keepsHistory() public {
        bytes32 before_ = _issue(aliceKey, DOC, 0);
        uint64 cutoff = uint64(block.timestamp) + 100;
        vm.warp(cutoff + 50);
        vm.prank(root);
        reg.revokeIssuer(alice, cutoff, 1);

        // issued before the cutoff: still valid
        (,,, CertificateRegistry.State s,,) = certs.getStatus(before_);
        assertEq(uint8(s), uint8(CertificateRegistry.State.Active));
        // cannot issue now
        bytes memory sig = _signIssue(aliceKey, keccak256("new"), 0, certs.nonces(alice));
        vm.expectRevert(CertificateRegistry.KeyNotActive.selector);
        certs.issue(alice, keccak256("new"), 0, sig);
    }

    function test_revokeIssuer_backdated_invalidatesLaterCerts() public {
        uint64 t0 = uint64(block.timestamp);
        bytes32 good = _issue(aliceKey, keccak256("good"), 0);
        vm.warp(t0 + 1000);
        bytes32 stolen = _issue(aliceKey, keccak256("stolen"), 0);
        vm.warp(t0 + 2000);
        // we discover the theft and say the key was compromised since t0+500
        vm.prank(root);
        reg.revokeIssuer(alice, t0 + 500, 1);
        (,,, CertificateRegistry.State g,,) = certs.getStatus(good);
        (,,, CertificateRegistry.State s,,) = certs.getStatus(stolen);
        assertEq(uint8(g), uint8(CertificateRegistry.State.Active));
        assertEq(uint8(s), uint8(CertificateRegistry.State.IssuerRevoked));
    }

    function test_revocation_cannotBeLoosened() public {
        uint64 t = uint64(block.timestamp);
        vm.startPrank(root);
        reg.revokeIssuer(alice, t, 1);
        vm.expectRevert(IssuerRegistry.CannotLoosenRevocation.selector);
        reg.revokeIssuer(alice, t + 10, 1);
        reg.revokeIssuer(alice, t - 10, 1); // earlier is fine
        vm.stopPrank();
    }

    function test_rotation_newKeyControlsOldCerts_oldKeyCannot() public {
        bytes32 id = _issue(aliceKey, DOC, 0);
        uint256 newKey = 0xC0FFEE;
        address newAddr = vm.addr(newKey);
        vm.warp(block.timestamp + 10);
        vm.prank(root);
        reg.rotateIssuerKey(alice, newAddr);

        assertEq(reg.identityOf(newAddr), alice);
        vm.prank(alice);
        vm.expectRevert(CertificateRegistry.NotController.selector);
        certs.suspend(id);

        vm.prank(newAddr);
        certs.suspend(id);
        (,,, CertificateRegistry.State s,,) = certs.getStatus(id);
        assertEq(uint8(s), uint8(CertificateRegistry.State.Suspended));

        // old cert issued before rotation remains valid once reinstated
        vm.prank(newAddr);
        certs.reinstate(id);
        (,,, s,,) = certs.getStatus(id);
        assertEq(uint8(s), uint8(CertificateRegistry.State.Active));
    }

    function test_rotation_rejectsUsedKey() public {
        vm.prank(root);
        vm.expectRevert(IssuerRegistry.KeyAlreadyUsed.selector);
        reg.rotateIssuerKey(alice, bob);
    }

    function test_cannotRemoveLastRoot() public {
        vm.startPrank(root);
        bytes32 role = reg.ROOT_AUTHORITY();
        vm.expectRevert(IssuerRegistry.LastRoot.selector);
        reg.renounceRole(role, root);
        vm.stopPrank();
    }

    // ============================================================ single issuance

    function test_issue_storesAndEmits() public {
        vm.expectEmit(true, true, true, true);
        emit CertificateRegistry.Issued(
            certs.recordId(alice, DOC), bytes8(keccak256(abi.encodePacked(DOC))) & bytes8(0xFFFFFFFFFFFFFFF0), alice, alice, 0
        );
        bytes32 id = _issue(aliceKey, DOC, 0);
        assertEq(id, certs.recordId(alice, DOC));
        (address issuer, uint64 at, uint64 exp, CertificateRegistry.State s,,) = certs.getStatus(id);
        assertEq(issuer, alice);
        assertEq(at, block.timestamp);
        assertEq(exp, 0);
        assertEq(uint8(s), uint8(CertificateRegistry.State.Active));
    }

    function test_issue_unknownCertIsNotFound() public view {
        (,,, CertificateRegistry.State s,,) = certs.getStatus(keccak256("nope"));
        assertEq(uint8(s), uint8(CertificateRegistry.State.NotFound));
    }

    function test_issue_cannotOverwriteRoot() public {
        _issue(aliceKey, DOC, 0);
        bytes memory sig = _signIssue(aliceKey, DOC, 0, certs.nonces(alice));
        vm.expectRevert(CertificateRegistry.AlreadyAnchored.selector);
        certs.issue(alice, DOC, 0, sig); // same identity cannot overwrite its own record (Bob gets a separate one)
    }

    function test_issue_rejectsUnregisteredSigner() public {
        uint256 evil = 0xE71;
        bytes memory sig = _signIssue(evil, DOC, 0, 0);
        vm.expectRevert(CertificateRegistry.KeyNotActive.selector);
        certs.issue(vm.addr(evil), DOC, 0, sig);
    }

    function test_issue_rejectsSignatureFromSomeoneElse() public {
        // Bob signs but claims to be Alice.
        bytes memory sig = _signIssue(bobKey, DOC, 0, 0);
        vm.expectRevert(CertificateRegistry.BadSignature.selector);
        certs.issue(alice, DOC, 0, sig);
    }

    function test_issue_rejectsTamperedParams() public {
        bytes memory sig = _signIssue(aliceKey, DOC, 0, 0);
        vm.expectRevert(CertificateRegistry.BadSignature.selector);
        certs.issue(alice, DOC, 4_000_000_000, sig); // expiry changed after signing
    }

    function test_issue_replayIsImpossible() public {
        bytes memory sig = _signIssue(aliceKey, DOC, 0, 0);
        certs.issue(alice, DOC, 0, sig);
        assertEq(certs.nonces(alice), 1);
        vm.expectRevert(CertificateRegistry.AlreadyAnchored.selector);
        certs.issue(alice, DOC, 0, sig);
        // and the old signature is dead for any other root because the nonce moved
        vm.expectRevert(CertificateRegistry.BadSignature.selector);
        certs.issue(alice, keccak256("other"), 0, sig);
    }

    function test_issue_signatureIsChainBound() public {
        bytes memory sig = _signIssue(aliceKey, DOC, 0, 0);
        vm.chainId(8453);
        // domain separator is rebuilt for the new chain id, so the old signature fails
        vm.expectRevert(CertificateRegistry.BadSignature.selector);
        certs.issue(alice, DOC, 0, sig);
    }

    function test_issue_signatureIsContractBound() public {
        bytes memory sig = _signIssue(aliceKey, DOC, 0, 0);
        CertificateRegistry other = new CertificateRegistry(reg);
        vm.expectRevert(CertificateRegistry.BadSignature.selector);
        other.issue(alice, DOC, 0, sig);
    }

    function test_issue_anyoneCanRelay() public {
        bytes memory sig = _signIssue(aliceKey, DOC, 0, 0);
        vm.prank(makeAddr("relayer"));
        certs.issue(alice, DOC, 0, sig);
        (address issuer,,,,,) = certs.getStatus(certs.recordId(alice, DOC));
        assertEq(issuer, alice);
    }

    function test_issue_pastExpiryRejected() public {
        bytes memory sig = _signIssue(aliceKey, DOC, uint64(block.timestamp), 0);
        vm.expectRevert(CertificateRegistry.BadExpiry.selector);
        certs.issue(alice, DOC, uint64(block.timestamp), sig);
    }

    function test_expiry_flipsState() public {
        uint64 exp = uint64(block.timestamp) + 1 days;
        bytes32 id = _issue(aliceKey, DOC, exp);
        (,,, CertificateRegistry.State s,,) = certs.getStatus(id);
        assertEq(uint8(s), uint8(CertificateRegistry.State.Active));
        vm.warp(exp);
        (,,, s,,) = certs.getStatus(id);
        assertEq(uint8(s), uint8(CertificateRegistry.State.Expired));
    }

    // ============================================================ lifecycle

    function test_revoke_setsReasonAndTime_andIsTerminal() public {
        bytes32 id = _issue(aliceKey, DOC, 0);
        vm.warp(block.timestamp + 5);
        vm.prank(alice);
        certs.revoke(id, 2);
        (,,, CertificateRegistry.State s, uint8 reason, uint64 at) = certs.getStatus(id);
        assertEq(uint8(s), uint8(CertificateRegistry.State.Revoked));
        assertEq(reason, 2);
        assertEq(at, block.timestamp);

        vm.startPrank(alice);
        vm.expectRevert(CertificateRegistry.BadTransition.selector);
        certs.reinstate(id);
        vm.expectRevert(CertificateRegistry.BadTransition.selector);
        certs.suspend(id);
        vm.expectRevert(CertificateRegistry.BadTransition.selector);
        certs.revoke(id, 1);
        vm.stopPrank();
    }

    function test_revoke_needsValidReason() public {
        bytes32 id = _issue(aliceKey, DOC, 0);
        vm.startPrank(alice);
        vm.expectRevert(CertificateRegistry.BadReason.selector);
        certs.revoke(id, 0);
        vm.expectRevert(CertificateRegistry.BadReason.selector);
        certs.revoke(id, 6);
        vm.stopPrank();
    }

    function test_suspend_reinstate_roundtrip() public {
        bytes32 id = _issue(aliceKey, DOC, 0);
        vm.startPrank(alice);
        certs.suspend(id);
        (,,, CertificateRegistry.State s,,) = certs.getStatus(id);
        assertEq(uint8(s), uint8(CertificateRegistry.State.Suspended));
        certs.reinstate(id);
        (,,, s,,) = certs.getStatus(id);
        assertEq(uint8(s), uint8(CertificateRegistry.State.Active));
        vm.stopPrank();
    }

    function test_nonIssuer_cannotTouchCertificate() public {
        bytes32 id = _issue(aliceKey, DOC, 0);
        vm.startPrank(bob);
        vm.expectRevert(CertificateRegistry.NotController.selector);
        certs.revoke(id, 1);
        vm.expectRevert(CertificateRegistry.NotController.selector);
        certs.suspend(id);
        vm.stopPrank();
        vm.prank(makeAddr("rando"));
        vm.expectRevert(CertificateRegistry.NotController.selector);
        certs.revoke(id, 1);
    }

    function test_revokedKey_cannotRevokeAnymore() public {
        bytes32 id = _issue(aliceKey, DOC, 0);
        vm.warp(block.timestamp + 1);
        vm.prank(root);
        reg.revokeIssuer(alice, uint64(block.timestamp), 1);
        vm.prank(alice);
        vm.expectRevert(CertificateRegistry.NotController.selector);
        certs.revoke(id, 1);
    }

    function test_lifecycle_unknownCert() public {
        vm.prank(alice);
        vm.expectRevert(CertificateRegistry.UnknownCert.selector);
        certs.revoke(keccak256("ghost"), 1);
    }

    function test_revoked_beatsExpired() public {
        uint64 exp = uint64(block.timestamp) + 100;
        bytes32 id = _issue(aliceKey, DOC, exp);
        vm.prank(alice);
        certs.revoke(id, 5);
        vm.warp(exp + 1);
        (,,, CertificateRegistry.State s,,) = certs.getStatus(id);
        assertEq(uint8(s), uint8(CertificateRegistry.State.Revoked));
    }

    // ============================================================ pause

    function test_pause_blocksIssuance_notRevocation() public {
        bytes32 id = _issue(aliceKey, DOC, 0);
        vm.prank(root);
        certs.pause();

        bytes memory sig = _signIssue(aliceKey, keccak256("x"), 0, certs.nonces(alice));
        vm.expectRevert(CertificateRegistry.IsPaused.selector);
        certs.issue(alice, keccak256("x"), 0, sig);

        vm.prank(alice);
        certs.revoke(id, 1); // still works

        vm.prank(root);
        certs.unpause();
        _issue(aliceKey, keccak256("x"), 0);
    }

    function test_pause_onlyRoot() public {
        vm.prank(alice);
        vm.expectRevert(CertificateRegistry.NotRoot.selector);
        certs.pause();
    }

    // ============================================================ batch

    function _batch(uint256 n) internal pure returns (bytes32[] memory docs, uint64[] memory exps, bytes32[] memory leaves) {
        docs = new bytes32[](n);
        exps = new uint64[](n);
        leaves = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            docs[i] = keccak256(abi.encode("batch", i));
            exps[i] = i % 3 == 0 ? 0 : uint64(4_000_000_000 + i);
            leaves[i] = _leaf(docs[i], exps[i]);
        }
    }

    function test_batch_issue_andVerifyEveryMember() public {
        (bytes32[] memory docs, uint64[] memory exps, bytes32[] memory leaves) = _batch(21);
        (bytes32 batchRoot,) = _tree(leaves, 0);
        certs.issueBatch(alice, batchRoot, 21, _signBatch(aliceKey, batchRoot, 21, 0));
        for (uint256 i = 0; i < 21; i++) {
            (, bytes32[] memory proof) = _tree(leaves, i);
            assertTrue(certs.verifyInBatch(batchRoot, docs[i], exps[i], proof));
            CertificateRegistry.CertView memory v = certs.getBatchCert(alice, batchRoot, docs[i], exps[i], proof);
            assertEq(uint8(v.state), uint8(CertificateRegistry.State.Active));
            assertEq(v.cert.issuer, alice);
        }
    }

    function test_batch_wrongExpiry_orWrongDoc_isNotFound() public {
        (bytes32[] memory docs, uint64[] memory exps, bytes32[] memory leaves) = _batch(5);
        (bytes32 batchRoot, bytes32[] memory proof) = _tree(leaves, 2);
        certs.issueBatch(alice, batchRoot, 5, _signBatch(aliceKey, batchRoot, 5, 0));
        assertEq(uint8(certs.getBatchCert(alice, batchRoot, docs[2], exps[2] + 1, proof).state), 0);
        assertEq(uint8(certs.getBatchCert(alice, batchRoot, docs[3], exps[3], proof).state), 0);
    }

    function test_batch_cannotReanchor_orEmpty() public {
        (,, bytes32[] memory leaves) = _batch(4);
        (bytes32 batchRoot,) = _tree(leaves, 0);
        certs.issueBatch(alice, batchRoot, 4, _signBatch(aliceKey, batchRoot, 4, 0));
        // the SAME identity cannot anchor the same root twice (Bob can: his record is separate, see ReviewTest)
        bytes memory sig = _signBatch(aliceKey, batchRoot, 4, 1);
        vm.expectRevert(CertificateRegistry.AlreadyAnchored.selector);
        certs.issueBatch(alice, batchRoot, 4, sig);
        bytes memory sig2 = _signBatch(aliceKey, keccak256("e"), 0, 1);
        vm.expectRevert(CertificateRegistry.EmptyBatch.selector);
        certs.issueBatch(alice, keccak256("e"), 0, sig2);
    }

    function test_batch_revokeOne_leavesOthersUntouched() public {
        (bytes32[] memory docs, uint64[] memory exps, bytes32[] memory leaves) = _batch(9);
        (bytes32 batchRoot, bytes32[] memory proof3) = _tree(leaves, 3);
        certs.issueBatch(alice, batchRoot, 9, _signBatch(aliceKey, batchRoot, 9, 0));

        vm.prank(alice);
        certs.revokeFromBatch(batchRoot, docs[3], exps[3], proof3, 2);

        assertEq(uint8(certs.getBatchCert(alice, batchRoot, docs[3], exps[3], proof3).state), uint8(CertificateRegistry.State.Revoked));
        (, bytes32[] memory proof4) = _tree(leaves, 4);
        assertEq(uint8(certs.getBatchCert(alice, batchRoot, docs[4], exps[4], proof4).state), uint8(CertificateRegistry.State.Active));
    }

    function test_batch_suspend_thenReinstate() public {
        (bytes32[] memory docs, uint64[] memory exps, bytes32[] memory leaves) = _batch(4);
        (bytes32 batchRoot, bytes32[] memory proof) = _tree(leaves, 1);
        certs.issueBatch(alice, batchRoot, 4, _signBatch(aliceKey, batchRoot, 4, 0));
        vm.startPrank(alice);
        certs.suspendFromBatch(batchRoot, docs[1], exps[1], proof);
        assertEq(uint8(certs.getBatchCert(alice, batchRoot, docs[1], exps[1], proof).state), uint8(CertificateRegistry.State.Suspended));
        certs.reinstate(certs.batchRid(alice, batchRoot, docs[1]));
        assertEq(uint8(certs.getBatchCert(alice, batchRoot, docs[1], exps[1], proof).state), uint8(CertificateRegistry.State.Active));
        vm.stopPrank();
    }

    function test_batch_otherIssuer_cannotRevoke() public {
        (bytes32[] memory docs, uint64[] memory exps, bytes32[] memory leaves) = _batch(4);
        (bytes32 batchRoot, bytes32[] memory proof) = _tree(leaves, 0);
        certs.issueBatch(alice, batchRoot, 4, _signBatch(aliceKey, batchRoot, 4, 0));
        vm.prank(bob);
        vm.expectRevert(CertificateRegistry.UnknownBatch.selector); // Bob has no such batch in his own namespace
        certs.revokeFromBatch(batchRoot, docs[0], exps[0], proof, 1);
    }

    function test_batch_squatting_isImpossible() public {
        // Bob learns the document root of one of Alice's batch certificates and puts it into his own batch.
        (bytes32[] memory docs, uint64[] memory exps, bytes32[] memory leaves) = _batch(4);
        (bytes32 aliceBatch, bytes32[] memory aliceProof) = _tree(leaves, 0);
        certs.issueBatch(alice, aliceBatch, 4, _signBatch(aliceKey, aliceBatch, 4, 0));

        bytes32[] memory bl = new bytes32[](2);
        bl[0] = _leaf(docs[0], exps[0]); // same document root + expiry
        bl[1] = _leaf(keccak256("b2"), 0);
        (bytes32 bobBatch, bytes32[] memory bobProof) = _tree(bl, 0);
        certs.issueBatch(bob, bobBatch, 2, _signBatch(bobKey, bobBatch, 2, 0));
        vm.prank(bob);
        certs.revokeFromBatch(bobBatch, docs[0], exps[0], bobProof, 1);

        // Alice's certificate is untouched; verifiers query by (batch, proof).
        assertEq(uint8(certs.getBatchCert(alice, aliceBatch, docs[0], exps[0], aliceProof).state), uint8(CertificateRegistry.State.Active));
        assertEq(certs.getBatchCert(alice, aliceBatch, docs[0], exps[0], aliceProof).cert.issuer, alice);
    }

    function test_batch_issuerRevokedAfterCutoff() public {
        uint64 t0 = uint64(block.timestamp);
        (bytes32[] memory docs, uint64[] memory exps, bytes32[] memory leaves) = _batch(4);
        (bytes32 batchRoot, bytes32[] memory proof) = _tree(leaves, 2);
        vm.warp(t0 + 100);
        certs.issueBatch(alice, batchRoot, 4, _signBatch(aliceKey, batchRoot, 4, 0));
        vm.warp(t0 + 200);
        vm.prank(root);
        reg.revokeIssuer(alice, t0 + 50, 1); // compromised since before that batch
        assertEq(uint8(certs.getBatchCert(alice, batchRoot, docs[2], exps[2], proof).state), uint8(CertificateRegistry.State.IssuerRevoked));
    }

    function test_batch_gasPerCertificate() public {
        (,, bytes32[] memory leaves) = _batch(200);
        (bytes32 batchRoot,) = _tree(leaves, 0);
        bytes memory sig = _signBatch(aliceKey, batchRoot, 200, 0);
        uint256 g = gasleft();
        certs.issueBatch(alice, batchRoot, 200, sig);
        uint256 used = g - gasleft();
        emit log_named_uint("gas for a 200-certificate batch", used);
        emit log_named_uint("gas per certificate", used / 200);
        assertLt(used / 200, 2000);
    }
}

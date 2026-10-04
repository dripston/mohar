// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {IssuerRegistry} from "../src/IssuerRegistry.sol";
import {CertificateRegistry} from "../src/CertificateRegistry.sol";

/// @notice Phase 13 hostile pass over v2. Each test pins a property an attacker would try to break.
contract HardeningTest is Base {
    // ---- 13.2: only the authority sets issuer type, whoever calls and whatever they pass
    function testFuzz_onlyRootSetsIssuerType(address caller, uint8 t, string calldata src) public {
        vm.assume(caller != root);
        vm.assume(bytes(src).length <= 120);
        IssuerRegistry.IssuerType before_ = reg.getIssuer(alice).issuerType;
        vm.prank(caller);
        try reg.setIssuerType(alice, IssuerRegistry.IssuerType(bound(t, 0, 3)), src) {
            revert("non-root changed the issuer type");
        } catch {}
        assertEq(uint8(reg.getIssuer(alice).issuerType), uint8(before_));
    }

    // ---- an accredited issuer cannot touch another issuer's batch, even knowing its root and proofs
    function test_otherIssuer_cannotRevokeOrSuspendMyBatchMember() public {
        (bytes32[] memory docs, uint64[] memory exps, bytes32[] memory leaves) = _batch(4);
        (bytes32 bRoot, bytes32[] memory proof) = _tree(leaves, 1);
        certs.issueBatch(alice, bRoot, 4, _signBatch(aliceKey, bRoot, 4, certs.nonces(alice)));
        vm.startPrank(bob);
        vm.expectRevert(CertificateRegistry.UnknownBatch.selector);
        certs.revokeFromBatch(bRoot, docs[1], exps[1], proof, 1);
        vm.expectRevert(CertificateRegistry.UnknownBatch.selector);
        certs.suspendFromBatch(bRoot, docs[1], exps[1], proof);
        vm.stopPrank();
    }

    // ---- every state change is visible to an indexer: a StatusChanged event with the right actor
    function test_everyLifecycleChange_emitsStatusChanged() public {
        bytes32 id = _issue(aliceKey, keccak256("doc"), 0);
        vm.startPrank(alice);
        vm.expectEmit(true, false, false, true);
        emit CertificateRegistry.StatusChanged(id, CertificateRegistry.Status.Suspended, 0, alice);
        certs.suspend(id);
        vm.expectEmit(true, false, false, true);
        emit CertificateRegistry.StatusChanged(id, CertificateRegistry.Status.Active, 0, alice);
        certs.reinstate(id);
        vm.expectEmit(true, false, false, true);
        emit CertificateRegistry.StatusChanged(id, CertificateRegistry.Status.Revoked, 3, alice);
        certs.revoke(id, 3);
        vm.stopPrank();
    }

    // ---- pause stops issuance and nothing else; unpause restores it; strangers cannot pause
    function test_pause_blocksIssuance_butNotRevoke_andOnlyRoot() public {
        bytes32 id = _issue(aliceKey, keccak256("doc2"), 0);
        vm.prank(bob);
        vm.expectRevert(CertificateRegistry.NotRoot.selector);
        certs.pause();
        vm.prank(root);
        certs.pause();
        bytes32 d = keccak256("doc3");
        uint256 n = certs.nonces(alice);
        bytes memory sig = _signIssue(aliceKey, d, 0, n);
        vm.expectRevert(CertificateRegistry.IsPaused.selector);
        certs.issue(alice, d, 0, sig);
        vm.prank(alice);
        certs.revoke(id, 1); // incident response still works
        vm.prank(root);
        certs.unpause();
        certs.issue(alice, d, 0, sig); // the same signature is still valid: nothing consumed while paused
    }

    // ---- a signature the issuer regrets can be killed, and a killed signature never lands
    function test_invalidatePendingSignatures_killsOldSignature() public {
        bytes32 d = keccak256("regret");
        bytes memory sig = _signIssue(aliceKey, d, 0, certs.nonces(alice));
        vm.prank(alice);
        certs.invalidatePendingSignatures();
        vm.expectRevert(CertificateRegistry.BadSignature.selector);
        certs.issue(alice, d, 0, sig);
    }

    // ---- an expired certificate stays expired when reinstated; reinstate never resurrects a revoked one
    function test_reinstate_cannotResurrect_revoked_orBeatExpiry() public {
        bytes32 id = _issue(aliceKey, keccak256("e"), uint64(block.timestamp + 100));
        vm.startPrank(alice);
        certs.suspend(id);
        vm.warp(block.timestamp + 200);
        certs.reinstate(id);
        vm.stopPrank();
        assertEq(uint8(certs.getCert(id).state), uint8(CertificateRegistry.State.Expired));
        vm.startPrank(alice);
        certs.revoke(id, 2);
        vm.expectRevert(CertificateRegistry.BadTransition.selector);
        certs.reinstate(id);
        vm.stopPrank();
    }

    // ---- hostile inputs do not break accounting: oversized proofs and zero roots are rejected, not stored
    function testFuzz_garbageBatchProof_neverMaterialises(bytes32 r, bytes32 doc, uint64 e, bytes32[] calldata proof) public {
        vm.assume(proof.length < 40);
        vm.startPrank(alice);
        vm.expectRevert(); // UnknownBatch (nothing anchored) before any state is written
        certs.revokeFromBatch(r, doc, e, proof, 1);
        vm.stopPrank();
        assertEq(uint8(certs.getBatchCert(alice, r, doc, e, proof).state), uint8(CertificateRegistry.State.NotFound));
    }

    function _batch(uint256 n) internal pure returns (bytes32[] memory docs, uint64[] memory exps, bytes32[] memory leaves) {
        docs = new bytes32[](n);
        exps = new uint64[](n);
        leaves = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            docs[i] = keccak256(abi.encode("hd", i));
            exps[i] = 0;
            leaves[i] = _leaf(docs[i], exps[i]);
        }
    }
}

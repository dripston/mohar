// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {IssuerRegistry} from "../src/IssuerRegistry.sol";
import {CertificateRegistry} from "../src/CertificateRegistry.sol";

/// @notice Contract v2: issuer type + accreditation source, complete events, pause semantics.
contract V2Test is Base {
    // ------------------------------------------------------------ issuer type and accreditation source

    function test_registerTyped_storesAndEmits() public {
        address college = makeAddr("college");
        vm.expectEmit(true, false, false, true);
        emit IssuerRegistry.IssuerRegistered(
            college, "Demo College", "demo.edu", true, IssuerRegistry.IssuerType.INSTITUTE, "Ministry notified list (demo)"
        );
        vm.prank(root);
        reg.registerIssuer(
            college, "demo.edu", "Demo College", true, IssuerRegistry.IssuerType.INSTITUTE, "Ministry notified list (demo)"
        );
        IssuerRegistry.Issuer memory i = reg.getIssuer(college);
        assertEq(uint8(i.issuerType), uint8(IssuerRegistry.IssuerType.INSTITUTE));
        assertEq(i.accreditationSource, "Ministry notified list (demo)");
    }

    function test_legacyRegister_defaultsToOther() public view {
        IssuerRegistry.Issuer memory i = reg.getIssuer(alice);
        assertEq(uint8(i.issuerType), uint8(IssuerRegistry.IssuerType.OTHER));
        assertEq(bytes(i.accreditationSource).length, 0);
    }

    function test_onlyRoot_setsIssuerType() public {
        // an accredited issuer cannot promote itself, and neither can a stranger
        vm.prank(alice);
        vm.expectRevert(IssuerRegistry.NotRoot.selector);
        reg.setIssuerType(alice, IssuerRegistry.IssuerType.REVENUE_OFFICE, "self-declared");
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(IssuerRegistry.NotRoot.selector);
        reg.registerIssuer(makeAddr("x"), "x.in", "X", false, IssuerRegistry.IssuerType.INSTITUTE, "s");
        assertEq(uint8(reg.getIssuer(alice).issuerType), uint8(IssuerRegistry.IssuerType.OTHER));
    }

    function test_setIssuerType_emitsAndUpdates() public {
        vm.expectEmit(true, false, false, true);
        emit IssuerRegistry.IssuerClassified(alice, IssuerRegistry.IssuerType.REVENUE_OFFICE, "Tehsil list (demo)");
        vm.prank(root);
        reg.setIssuerType(alice, IssuerRegistry.IssuerType.REVENUE_OFFICE, "Tehsil list (demo)");
        assertEq(uint8(reg.getIssuer(alice).issuerType), uint8(IssuerRegistry.IssuerType.REVENUE_OFFICE));
    }

    function test_setIssuerType_unknownIssuer_andOversizedSource_revert() public {
        vm.startPrank(root);
        vm.expectRevert(IssuerRegistry.UnknownIssuer.selector);
        reg.setIssuerType(makeAddr("nobody"), IssuerRegistry.IssuerType.OTHER, "x");
        vm.expectRevert(IssuerRegistry.EmptyField.selector);
        reg.setIssuerType(alice, IssuerRegistry.IssuerType.OTHER, string(new bytes(121)));
        vm.stopPrank();
    }

    function test_keyRotation_keepsIssuerType() public {
        vm.prank(root);
        reg.setIssuerType(alice, IssuerRegistry.IssuerType.INSTITUTE, "demo");
        address newKey = makeAddr("aliceNew");
        vm.prank(root);
        reg.rotateIssuerKey(alice, newKey);
        // type belongs to the identity, so it survives rotation
        assertEq(uint8(reg.getIssuer(reg.identityOf(newKey)).issuerType), uint8(IssuerRegistry.IssuerType.INSTITUTE));
    }

    // ------------------------------------------------------------ every registry change emits an event

    function test_everyRegistryChange_emits() public {
        vm.startPrank(root);
        vm.expectEmit(true, false, false, true);
        emit IssuerRegistry.DomainAttested(bob, uint64(block.timestamp));
        reg.attestDomain(bob);

        vm.expectEmit(true, true, false, true);
        emit IssuerRegistry.KeyRevoked(bob, bob, uint64(block.timestamp), 2);
        reg.revokeIssuer(bob, uint64(block.timestamp), 2);

        address k2 = makeAddr("k2");
        vm.expectEmit(true, true, true, true);
        emit IssuerRegistry.KeyRotated(alice, alice, k2, uint64(block.timestamp));
        reg.rotateIssuerKey(alice, k2);

        // role changes come from AccessControl's own events
        address second = makeAddr("secondRoot");
        vm.expectEmit(true, true, true, true);
        emit IAccessControlEvents.RoleGranted(reg.ROOT_AUTHORITY(), second, root);
        reg.grantRole(reg.ROOT_AUTHORITY(), second);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ pause stops ISSUANCE only

    function test_pause_blocksIssuance_butNeverRevokeSuspendReinstateOrReads() public {
        // two certificates and a batch exist before the incident
        bytes32 single = _issue(aliceKey, keccak256("pre-single"), 0);
        bytes32[] memory leaves = new bytes32[](2);
        bytes32[] memory docs = new bytes32[](2);
        for (uint256 i = 0; i < 2; i++) {
            docs[i] = keccak256(abi.encode("pre-batch", i));
            leaves[i] = _leaf(docs[i], 0);
        }
        (bytes32 batchRoot, bytes32[] memory proof0) = _tree(leaves, 0);
        certs.issueBatch(alice, batchRoot, 2, _signBatch(aliceKey, batchRoot, 2, certs.nonces(alice)));

        vm.prank(root);
        certs.pause();

        // issuance (single and batch) is stopped
        bytes memory s1 = _signIssue(aliceKey, keccak256("new"), 0, certs.nonces(alice));
        vm.expectRevert(CertificateRegistry.IsPaused.selector);
        certs.issue(alice, keccak256("new"), 0, s1);
        bytes memory s2 = _signBatch(aliceKey, keccak256("nb"), 1, certs.nonces(alice));
        vm.expectRevert(CertificateRegistry.IsPaused.selector);
        certs.issueBatch(alice, keccak256("nb"), 1, s2);

        // honest issuers can still clean up during the incident
        vm.startPrank(alice);
        certs.suspend(single);
        certs.reinstate(single);
        certs.revoke(single, 2);
        certs.revokeFromBatch(batchRoot, docs[0], 0, proof0, 1);
        vm.stopPrank();

        // and verification keeps answering
        (,,, CertificateRegistry.State st,,) = certs.getStatus(single);
        assertEq(uint8(st), uint8(CertificateRegistry.State.Revoked));
        assertEq(uint8(certs.getBatchCert(alice, batchRoot, docs[0], 0, proof0).state), uint8(CertificateRegistry.State.Revoked));
        assertEq(uint8(certs.getBatchCert(alice, batchRoot, docs[1], 0, _proof(leaves, 1)).state), uint8(CertificateRegistry.State.Active));

        // authority can also revoke keys while paused, and unpausing restores issuance
        vm.startPrank(root);
        reg.revokeIssuer(bob, uint64(block.timestamp), 1);
        certs.unpause();
        vm.stopPrank();
        _issue(aliceKey, keccak256("after-unpause"), 0);
    }

    function _proof(bytes32[] memory leaves, uint256 i) internal pure returns (bytes32[] memory p) {
        (, p) = _tree(leaves, i);
    }

    function test_onlyRoot_canPause() public {
        vm.prank(alice);
        vm.expectRevert(CertificateRegistry.NotRoot.selector);
        certs.pause();
    }
}

interface IAccessControlEvents {
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
}

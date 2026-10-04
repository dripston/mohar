// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IssuerRegistry} from "../src/IssuerRegistry.sol";
import {CertificateRegistry} from "../src/CertificateRegistry.sol";

/// @notice Deploys both registries and writes `deployments/<NETWORK>.json`.
///   Anvil:        PRIVATE_KEY=0x... NETWORK=anvil forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///   Base Sepolia: PRIVATE_KEY=0x... NETWORK=base-sepolia forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify
/// The deployer becomes the ROOT_AUTHORITY (demo: the accreditation body). Optional demo issuer:
///   DEMO_ISSUER=0xAddress DEMO_ISSUER_NAME="Acharya Institute" DEMO_ISSUER_DOMAIN=acharya.ac.in
///   DEMO_ISSUER_TYPE=1 (0 other, 1 institute, 2 revenue office, 3 employer) DEMO_ISSUER_SOURCE="..."
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        string memory network = vm.envOr("NETWORK", string("anvil"));
        address root = vm.addr(pk);

        vm.startBroadcast(pk);
        IssuerRegistry reg = new IssuerRegistry(root);
        CertificateRegistry certs = new CertificateRegistry(reg);

        address demo = vm.envOr("DEMO_ISSUER", address(0));
        if (demo != address(0)) {
            reg.registerIssuer(
                demo,
                vm.envOr("DEMO_ISSUER_DOMAIN", string("acharya.ac.in")),
                vm.envOr("DEMO_ISSUER_NAME", string("Acharya Institute")),
                true,
                IssuerRegistry.IssuerType(uint8(vm.envOr("DEMO_ISSUER_TYPE", uint256(1)))),
                vm.envOr("DEMO_ISSUER_SOURCE", string("Demo list (not a real accreditation)"))
            );
        }
        vm.stopBroadcast();

        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "issuerRegistry", address(reg));
        vm.serializeAddress(k, "certificateRegistry", address(certs));
        vm.serializeAddress(k, "rootAuthority", root);
        vm.serializeUint(k, "deployBlock", block.number);
        string memory json = vm.serializeString(k, "network", network);
        string memory path = string.concat("../../deployments/", network, ".json");
        vm.writeJson(json, path);

        console.log("IssuerRegistry     ", address(reg));
        console.log("CertificateRegistry", address(certs));
        console.log("wrote", path);
    }
}

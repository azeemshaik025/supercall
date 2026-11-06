// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {Hisaab} from "../src/Hisaab.sol";

/// Deploy Hisaab to any chain. Reads roles from env vars so the same script
/// works for testnet and mainnet.
///
/// Required env:
///   PRIVATE_KEY   — deployer, pays gas
///   OWNER         — admin (transferOwnership later if needed)
///   WRITER        — API key that calls registerCall
///   SETTLER       — worker key that calls settleBatch
///   TREASURY      — platform fee recipient
///
/// USDC and Permit2 are the same on every Arc network.
contract Deploy is Script {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.envAddress("OWNER");
        address writer = vm.envAddress("WRITER");
        address settler = vm.envAddress("SETTLER");
        address treasury = vm.envAddress("TREASURY");

        require(USDC.code.length > 0, "USDC not deployed on this chain");
        require(PERMIT2.code.length > 0, "Permit2 not deployed on this chain");

        vm.startBroadcast(deployerKey);
        Hisaab hisaab = new Hisaab(USDC, PERMIT2, owner, writer, settler, treasury);
        vm.stopBroadcast();

        console2.log("Hisaab deployed to", address(hisaab));
        console2.log("  owner   ", owner);
        console2.log("  writer  ", writer);
        console2.log("  settler ", settler);
        console2.log("  treasury", treasury);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Hisaab} from "../src/Hisaab.sol";
import {IPermit2} from "../src/interfaces/IPermit2.sol";

/// Deploys Hisaab on Arc Testnet and proves the live path end to end with real USDC:
/// register a call, a follower pays the fee by Permit2 signature, the settler settles it as
/// Right with an inputs commitment. The follower pays 7 USDC (a 1,000 USDC notional copy).
///
/// Env: PRIVATE_KEY (writer, settler, treasury and payout wallet on testnet; pays the deploy gas),
///      FOLLOWER_PRIVATE_KEY (holds at least 7 USDC plus gas),
///      OWNER (optional; defaults to the PRIVATE_KEY address. Set it to keep admin on another wallet).
contract DeployAndProve is Script {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    uint256 internal constant SIZE = 1000e6;
    uint256 internal constant FEE = 7e6;

    bytes32 internal constant PERMIT_TYPEHASH = keccak256(
        "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,CallFee witness)CallFee(bytes32 call,uint256 size)TokenPermissions(address token,uint256 amount)"
    );
    bytes32 internal constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    bytes32 internal constant CALL_FEE_TYPEHASH = keccak256("CallFee(bytes32 call,uint256 size)");

    function run() external {
        uint256 opsKey = vm.envUint("PRIVATE_KEY");
        uint256 followerKey = vm.envUint("FOLLOWER_PRIVATE_KEY");
        address ops = vm.addr(opsKey);
        address follower = vm.addr(followerKey);
        require(USDC.code.length > 0 && PERMIT2.code.length > 0, "USDC or Permit2 missing");
        require(IERC20(USDC).balanceOf(follower) >= FEE, "follower needs 7 USDC");

        vm.startBroadcast(opsKey);
        Hisaab hisaab = new Hisaab(USDC, PERMIT2, vm.envOr("OWNER", ops), ops, ops, ops);
        bytes32 id = keccak256(abi.encode("supercall:proof", block.timestamp));
        bytes32 caller = keccak256("supercall:caller:proof");
        hisaab.registerCall(id, keccak256(abi.encode("fp", id)), caller, ops, 5010, uint64(block.timestamp + 1 days));
        vm.stopBroadcast();

        if (IERC20(USDC).allowance(follower, PERMIT2) < FEE) {
            vm.startBroadcast(followerKey);
            IERC20(USDC).approve(PERMIT2, type(uint256).max);
            vm.stopBroadcast();
        }

        uint256 nonce = uint256(keccak256(abi.encode(id, follower)));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(followerKey, hisaab, id, nonce, deadline);
        bytes32 inputs = keccak256(abi.encode("supercall:inputs:v1", id, uint256(0), "proof: Right, filled, kept 6"));

        vm.startBroadcast(opsKey);
        hisaab.payFee(id, follower, SIZE, nonce, deadline, sig);
        Hisaab.Result[] memory rs = new Hisaab.Result[](1);
        rs[0] = Hisaab.Result(true, 6e6, 0, inputs);
        hisaab.settleBatch(id, Hisaab.Ending.Right, 0, rs);
        vm.stopBroadcast();

        console2.log("Hisaab", address(hisaab));
        console2.log("proof call");
        console2.logBytes32(id);
        console2.log("follower", follower);
        console2.log("inputs");
        console2.logBytes32(inputs);
        console2.log("earned fund (expect 2994000)", hisaab.earnedFund(caller));
    }

    function _sign(uint256 key, Hisaab hisaab, bytes32 id, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 witness = keccak256(abi.encode(CALL_FEE_TYPEHASH, id, SIZE));
        bytes32 tp = keccak256(abi.encode(TOKEN_PERMISSIONS_TYPEHASH, USDC, FEE));
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, tp, address(hisaab), nonce, deadline, witness));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", IPermit2(PERMIT2).DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}

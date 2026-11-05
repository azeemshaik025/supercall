// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console2} from "forge-std/Test.sol";
import {HisaabBase} from "./helpers/HisaabBase.sol";
import {HisaabHandler} from "./helpers/HisaabHandler.sol";

/// Solvency: USDC held always covers escrow, both funds, credit reserve, credit set aside and owed.
contract HisaabInvariantTest is HisaabBase {
    HisaabHandler internal handler;

    function setUp() public override {
        super.setUp();
        address[4] memory fs = [alice, bob, carol, priya];
        uint256[4] memory pks = [pkOf[alice], pkOf[bob], pkOf[carol], pkOf[priya]];
        address[3] memory ws = [wallet, wallet2, makeAddr("wallet3")];
        handler = new HisaabHandler(hisaab, usdc, permit2, settler, writer, treasury, fs, pks, ws);

        handler.seed();
        bytes4[] memory selectors = new bytes4[](12);
        selectors[0] = HisaabHandler.register.selector;
        selectors[1] = HisaabHandler.pay.selector;
        selectors[2] = HisaabHandler.settle.selector;
        selectors[3] = HisaabHandler.expire.selector;
        selectors[4] = HisaabHandler.setBlocked.selector;
        selectors[5] = HisaabHandler.claim.selector;
        selectors[6] = HisaabHandler.warp.selector;
        selectors[7] = HisaabHandler.startSettle.selector;
        selectors[8] = HisaabHandler.pay.selector;
        selectors[9] = HisaabHandler.pay.selector;
        selectors[10] = HisaabHandler.settle.selector;
        selectors[11] = HisaabHandler.register.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// USDC held >= escrow + earned + credit-only + credit reserve + credit set aside + owed.
    function invariant_UsdcCoversEveryLiability() public view {
        assertGe(bal(address(hisaab)), handler.totalLiabilities());
    }

    /// Nothing leaks out and nothing is minted from thin air: held USDC equals the liabilities exactly.
    function invariant_NoUsdcLeakage() public view {
        assertEq(bal(address(hisaab)), handler.totalLiabilities());
    }

    /// The credit reserve is exactly the sum of follower credit balances.
    function invariant_CreditReserveMatchesLedger() public view {
        assertEq(hisaab.creditReserve(), handler.creditLedgerSum());
    }

    /// Done calls have empty escrow and nothing set aside; cursors never pass the copy count.
    function invariant_DoneCallsAreEmpty() public view {
        assertTrue(handler.checkCallsConsistent());
    }

    /// Reports how much of the state space each run actually reached.
    function afterInvariant() public view {
        console2.log("pay/settle/wrong/expire/claim");
        console2.log(handler.payOk(), handler.settleOk(), handler.wrongOk());
        console2.log(handler.expireOk(), handler.claimOk());
    }
}

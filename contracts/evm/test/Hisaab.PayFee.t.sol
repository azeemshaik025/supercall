// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Hisaab} from "../src/Hisaab.sol";
import {HisaabBase} from "./helpers/HisaabBase.sol";

contract HisaabPayFeeTest is HisaabBase {
    bytes4 internal constant INVALID_SIGNER = bytes4(keccak256("InvalidSigner()"));
    bytes4 internal constant INVALID_NONCE = bytes4(keccak256("InvalidNonce()"));
    bytes4 internal constant SIGNATURE_EXPIRED = bytes4(keccak256("SignatureExpired(uint256)"));

    function setUp() public override {
        super.setUp();
        _reg(CALL1);
    }

    // ------------------------------------------------------------ amounts
    function test_PayFee_1000Copy_Escrows6Plus1() public {
        uint256 f0 = bal(alice);
        uint256 h0 = bal(address(hisaab));
        uint256 idx = _pay(CALL1, alice, 1000e6);
        assertEq(idx, 0);
        assertEq(f0 - bal(alice), 7_000_000);
        assertEq(bal(address(hisaab)) - h0, 7_000_000);

        Hisaab.CallInfo memory c = hisaab.getCall(CALL1);
        assertEq(c.copyCount, 1);
        assertEq(c.escrowCash, 7_000_000);
        assertEq(c.escrowCredit, 0);
        Hisaab.CopyInfo memory cp = hisaab.getCopy(CALL1, 0);
        assertEq(cp.follower, alice);
        assertEq(cp.size, 1000e6);
        assertEq(cp.callFeeCash, 6_000_000);
        assertEq(cp.callFeeCredit, 0);
        assertEq(cp.platformFee, 1_000_000);
    }

    function test_PayFee_1Copy_Escrows0_006Plus0_001() public {
        uint256 h0 = bal(address(hisaab));
        _pay(CALL1, alice, 1e6);
        assertEq(bal(address(hisaab)) - h0, 7000);
        Hisaab.CopyInfo memory cp = hisaab.getCopy(CALL1, 0);
        assertEq(cp.callFeeCash, 6000);
        assertEq(cp.platformFee, 1000);
    }

    function test_PayFee_ReturnsSequentialIndices() public {
        assertEq(_pay(CALL1, alice, 10e6), 0);
        assertEq(_pay(CALL1, bob, 10e6), 1);
        assertEq(_pay(CALL1, alice, 10e6), 2);
        assertEq(hisaab.getCall(CALL1).copyCount, 3);
        assertEq(hisaab.getCopy(CALL1, 1).follower, bob);
    }

    function test_PayFee_EmitsCopied() public {
        uint256 nonce = 77;
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(pkOf[alice], CALL1, 1000e6, 7e6, nonce, dl);
        vm.expectEmit(true, true, false, true, address(hisaab));
        emit Hisaab.Copied(CALL1, alice, 0, 1000e6, 0, 7e6, address(this));
        hisaab.payFee(CALL1, alice, 1000e6, nonce, dl, sig);
    }

    function testFuzz_PayFee_EscrowEqualsFees(uint256 size) public {
        size = bound(size, 1e6, 1e12);
        uint256 f0 = bal(alice);
        uint256 h0 = bal(address(hisaab));
        _pay(CALL1, alice, size);
        uint256 expected = (size * 60) / 10_000 + (size * 10) / 10_000;
        assertEq(f0 - bal(alice), expected);
        assertEq(bal(address(hisaab)) - h0, expected);
        assertEq(hisaab.getCall(CALL1).escrowCash, expected);
    }

    // ------------------------------------------------------------ credit first
    function test_PayFee_CreditPaysCallFeeFirst() public {
        _giveCredit(alice, 2e6);
        assertEq(hisaab.creditBalance(alice), 2e6);
        uint256 reserve0 = hisaab.creditReserve();
        uint256 f0 = bal(alice);
        uint256 h0 = bal(address(hisaab));

        uint256 nonce = 9;
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(pkOf[alice], CALL1, 1000e6, 7e6, nonce, dl);
        vm.expectEmit(true, true, false, true, address(hisaab));
        emit Hisaab.Copied(CALL1, alice, 0, 1000e6, 2e6, 5e6, address(this));
        hisaab.payFee(CALL1, alice, 1000e6, nonce, dl, sig);

        assertEq(f0 - bal(alice), 5e6, "only cash part pulled");
        assertEq(bal(address(hisaab)) - h0, 5e6);
        assertEq(hisaab.creditBalance(alice), 0);
        assertEq(reserve0 - hisaab.creditReserve(), 2e6, "reserve moved to escrow");
        Hisaab.CallInfo memory c = hisaab.getCall(CALL1);
        assertEq(c.escrowCredit, 2e6);
        assertEq(c.escrowCash, 5e6);
        Hisaab.CopyInfo memory cp = hisaab.getCopy(CALL1, 0);
        assertEq(cp.callFeeCredit, 2e6);
        assertEq(cp.callFeeCash, 4e6);
    }

    function test_PayFee_CreditCoversWholeCallFee() public {
        _giveCredit(alice, 10e6);
        uint256 f0 = bal(alice);
        _pay(CALL1, alice, 1000e6);
        assertEq(f0 - bal(alice), 1e6, "only the platform fee in cash");
        assertEq(hisaab.creditBalance(alice), 4e6);
        Hisaab.CopyInfo memory cp = hisaab.getCopy(CALL1, 0);
        assertEq(cp.callFeeCredit, 6e6);
        assertEq(cp.callFeeCash, 0);
        assertEq(cp.platformFee, 1e6);
    }

    function test_PayFee_CreditNotSpentIfPullFails() public {
        _giveCredit(alice, 2e6);
        uint256 reserve0 = hisaab.creditReserve();
        uint256 dl = block.timestamp + 1 hours;
        bytes memory bad = _sig(pkOf[bob], CALL1, 1000e6, 7e6, 3, dl); // wrong signer
        vm.expectRevert(INVALID_SIGNER);
        hisaab.payFee(CALL1, alice, 1000e6, 3, dl, bad);
        assertEq(hisaab.creditBalance(alice), 2e6);
        assertEq(hisaab.creditReserve(), reserve0);
        assertEq(hisaab.getCall(CALL1).copyCount, 0);
        assertEq(hisaab.getCall(CALL1).escrowCredit, 0);
    }

    function testFuzz_PayFee_CreditFirstThenCash(uint256 size, uint256 credit) public {
        size = bound(size, 1e6, 1e10);
        credit = bound(credit, 1000, 1e9);
        _giveCredit(alice, credit);
        uint256 callFee = _callFee(size);
        uint256 used = credit < callFee ? credit : callFee;
        uint256 f0 = bal(alice);
        _pay(CALL1, alice, size);
        assertEq(f0 - bal(alice), callFee - used + _platformFee(size));
        assertEq(hisaab.creditBalance(alice), credit - used);
        assertEq(hisaab.getCopy(CALL1, 0).callFeeCredit, used);
    }

    // ------------------------------------------------------------ signature failures
    function test_PayFee_WrongSizeSignatureReverts() public {
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(pkOf[alice], CALL1, 1000e6, 7e6, 1, dl);
        vm.expectRevert(INVALID_SIGNER);
        hisaab.payFee(CALL1, alice, 2000e6, 1, dl, sig);
    }

    function test_PayFee_SignatureForOtherCallReverts() public {
        _reg(CALL2);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(pkOf[alice], CALL1, 1000e6, 7e6, 1, dl);
        vm.expectRevert(INVALID_SIGNER);
        hisaab.payFee(CALL2, alice, 1000e6, 1, dl, sig);
    }

    function test_PayFee_SignatureForWrongAmountReverts() public {
        uint256 dl = block.timestamp + 1 hours;
        // signed for less than call fee + platform fee
        bytes memory sig = _sig(pkOf[alice], CALL1, 1000e6, 6e6, 1, dl);
        vm.expectRevert(INVALID_SIGNER);
        hisaab.payFee(CALL1, alice, 1000e6, 1, dl, sig);
    }

    function test_PayFee_SignatureByOtherSignerReverts() public {
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(pkOf[bob], CALL1, 1000e6, 7e6, 1, dl);
        vm.expectRevert(INVALID_SIGNER);
        hisaab.payFee(CALL1, alice, 1000e6, 1, dl, sig);
    }

    function test_PayFee_ReusedNonceReverts() public {
        uint256 dl = block.timestamp + 1 hours;
        hisaab.payFee(CALL1, alice, 1000e6, 5, dl, _sig(pkOf[alice], CALL1, 1000e6, 7e6, 5, dl));
        // fresh signature, same nonce
        bytes memory sig2 = _sig(pkOf[alice], CALL1, 500e6, 3.5e6, 5, dl);
        vm.expectRevert(INVALID_NONCE);
        hisaab.payFee(CALL1, alice, 500e6, 5, dl, sig2);
        assertEq(hisaab.getCall(CALL1).copyCount, 1);
    }

    function test_PayFee_SameSignatureCannotBeUsedTwice() public {
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(pkOf[alice], CALL1, 1000e6, 7e6, 8, dl);
        hisaab.payFee(CALL1, alice, 1000e6, 8, dl, sig);
        vm.expectRevert(INVALID_NONCE);
        hisaab.payFee(CALL1, alice, 1000e6, 8, dl, sig);
        // not even by a third party, and not on another call
        _reg(CALL2);
        vm.prank(stranger);
        vm.expectRevert();
        hisaab.payFee(CALL2, alice, 1000e6, 8, dl, sig);
    }

    function test_PayFee_ExpiredSignatureReverts() public {
        uint256 dl = block.timestamp + 100;
        bytes memory sig = _sig(pkOf[alice], CALL1, 1000e6, 7e6, 2, dl);
        vm.warp(dl + 1);
        vm.expectRevert(abi.encodeWithSelector(SIGNATURE_EXPIRED, dl));
        hisaab.payFee(CALL1, alice, 1000e6, 2, dl, sig);
        // still valid exactly at its deadline
        vm.warp(dl);
        hisaab.payFee(CALL1, alice, 1000e6, 2, dl, sig);
    }

    // ------------------------------------------------------------ submitter
    function test_PayFee_ThirdPartySubmitterPaysNothing() public {
        uint256 nonce = 4;
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(pkOf[alice], CALL1, 1000e6, 7e6, nonce, dl);
        uint256 s0 = bal(stranger);
        uint256 f0 = bal(alice);
        vm.expectEmit(true, true, false, true, address(hisaab));
        emit Hisaab.Copied(CALL1, alice, 0, 1000e6, 0, 7e6, stranger);
        vm.prank(stranger);
        hisaab.payFee(CALL1, alice, 1000e6, nonce, dl, sig);
        assertEq(bal(stranger), s0);
        assertEq(f0 - bal(alice), 7e6);
        assertEq(hisaab.getCopy(CALL1, 0).follower, alice);
    }

    function test_PayFee_ThirdPartySpendsFollowerCredit() public {
        _giveCredit(alice, 2e6);
        uint256 nonce = 4;
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(pkOf[alice], CALL1, 1000e6, 7e6, nonce, dl);
        vm.prank(stranger);
        hisaab.payFee(CALL1, alice, 1000e6, nonce, dl, sig);
        assertEq(hisaab.creditBalance(alice), 0);
    }

    // ------------------------------------------------------------ guards
    function test_PayFee_BelowMinimumSizeReverts() public {
        uint256 dl = block.timestamp + 1 hours;
        vm.expectRevert(abi.encodeWithSelector(Hisaab.SizeTooSmall.selector, 1e6 - 1, 1e6));
        hisaab.payFee(CALL1, alice, 1e6 - 1, 0, dl, "");
        vm.expectRevert(abi.encodeWithSelector(Hisaab.SizeTooSmall.selector, 0, 1e6));
        hisaab.payFee(CALL1, alice, 0, 0, dl, "");
        _pay(CALL1, alice, 1e6); // exactly the minimum works
    }

    function test_PayFee_RevertsWhenPaused() public {
        vm.prank(owner);
        hisaab.pause();
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(pkOf[alice], CALL1, 1000e6, 7e6, 0, dl);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        hisaab.payFee(CALL1, alice, 1000e6, 0, dl, sig);
        vm.prank(owner);
        hisaab.unpause();
        hisaab.payFee(CALL1, alice, 1000e6, 0, dl, sig);
    }

    function test_PayFee_PayoutWalletFollowerReverts() public {
        uint256 dl = block.timestamp + 1 hours;
        vm.expectRevert(Hisaab.InvalidFollower.selector);
        hisaab.payFee(CALL1, wallet, 1000e6, 0, dl, "");
        vm.expectRevert(Hisaab.InvalidFollower.selector);
        hisaab.payFee(CALL1, address(0), 1000e6, 0, dl, "");
    }

    function test_PayFee_UnknownCallReverts() public {
        uint256 dl = block.timestamp + 1 hours;
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidCall.selector, CALL2));
        hisaab.payFee(CALL2, alice, 1000e6, 0, dl, "");
    }

    function test_PayFee_ClosedAtDeadline() public {
        uint256 d = _deadlineOf(CALL1);
        vm.warp(d - 1);
        _pay(CALL1, alice, 1000e6);
        vm.warp(d);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(pkOf[bob], CALL1, 1000e6, 7e6, 99, dl);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.CopyingClosed.selector, CALL1));
        hisaab.payFee(CALL1, bob, 1000e6, 99, dl, sig);
    }

    function test_PayFee_ClosedAfterSettlementStarts() public {
        _pay(CALL1, alice, 1000e6);
        vm.prank(settler);
        hisaab.startSettlement(CALL1);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(pkOf[bob], CALL1, 1000e6, 7e6, 99, dl);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.CopyingClosed.selector, CALL1));
        hisaab.payFee(CALL1, bob, 1000e6, 99, dl, sig);
    }

    function test_PayFee_ClosedAfterFirstBatchSettles() public {
        _pay(CALL1, alice, 1000e6);
        _pay(CALL1, alice, 1000e6);
        _settle(CALL1, Hisaab.Ending.Refund, 0, _arr1(false, 0, 0)); // call is Settling
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(pkOf[bob], CALL1, 1000e6, 7e6, 99, dl);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.CopyingClosed.selector, CALL1));
        hisaab.payFee(CALL1, bob, 1000e6, 99, dl, sig);
    }

    function test_PayFee_ClosedWhenDone() public {
        _settle(CALL1, Hisaab.Ending.Refund, 0, new Hisaab.Result[](0)); // no copies: empty batch -> Done
        assertEq(uint8(hisaab.getCall(CALL1).status), uint8(Hisaab.Status.Done));
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(pkOf[bob], CALL1, 1000e6, 7e6, 99, dl);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.CopyingClosed.selector, CALL1));
        hisaab.payFee(CALL1, bob, 1000e6, 99, dl, sig);
    }

    function test_PayFee_ClosedWhenExpired() public {
        _pay(CALL1, alice, 1000e6);
        _expire(CALL1, 1); // marks expired, refunds the only copy
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sig(pkOf[bob], CALL1, 1000e6, 7e6, 99, dl);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.CopyingClosed.selector, CALL1));
        hisaab.payFee(CALL1, bob, 1000e6, 99, dl, sig);
    }

    function test_PayFee_HisaabHoldsNoDirectAllowance() public view {
        // Hisaab never holds a direct allowance from followers: pulls go through Permit2 only.
        assertEq(usdc.allowance(alice, address(hisaab)), 0);
    }
}

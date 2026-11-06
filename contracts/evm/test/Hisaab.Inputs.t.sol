// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Hisaab} from "../src/Hisaab.sol";
import {HisaabBase} from "./helpers/HisaabBase.sol";

/// The settler commits to each copy's off-chain inputs in the same transaction that pays it.
contract HisaabInputsTest is HisaabBase {
    Hisaab.Ending internal constant RIGHT = Hisaab.Ending.Right;
    Hisaab.Ending internal constant ABOVE = Hisaab.Ending.AboveEntry;
    Hisaab.Ending internal constant WRONG = Hisaab.Ending.Wrong;
    Hisaab.Ending internal constant REFUND = Hisaab.Ending.Refund;

    function _one(bool filled, uint256 kept, uint256 ask, bytes32 inputs)
        internal
        pure
        returns (Hisaab.Result[] memory rs)
    {
        rs = new Hisaab.Result[](1);
        rs[0] = Hisaab.Result(filled, kept, ask, inputs);
    }

    function test_Inputs_EmittedForEachCopyInOrder() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        _pay(CALL1, bob, 500e6);
        bytes32 a = keccak256("alice fill 2810");
        bytes32 b = keccak256("bob fill 2850");
        Hisaab.Result[] memory rs = new Hisaab.Result[](2);
        rs[0] = Hisaab.Result(true, 6e6, 0, a);
        rs[1] = Hisaab.Result(true, 3e6, 0, b);

        vm.expectEmit(true, true, false, true, address(hisaab));
        emit Hisaab.CopyInputs(CALL1, 0, a);
        vm.expectEmit(true, true, false, true, address(hisaab));
        emit Hisaab.CopyInputs(CALL1, 1, b);
        _settle(CALL1, RIGHT, 0, rs);
    }

    function test_Inputs_ZeroRevertsOnRightAboveEntryAndWrong() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        Hisaab.Ending[3] memory endings = [RIGHT, ABOVE, WRONG];
        for (uint256 i; i < endings.length; ++i) {
            Hisaab.Result[] memory rs = _one(true, 0, 0, bytes32(0));
            vm.prank(settler);
            vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidResult.selector, CALL1, 0));
            hisaab.settleBatch(CALL1, endings[i], 0, rs);
        }
        Hisaab.CallInfo memory c = hisaab.getCall(CALL1);
        assertEq(c.cursor, 0, "nothing settled");
        assertEq(uint8(c.status), uint8(Hisaab.Status.Open), "still open");
        assertFalse(c.endingSet, "no ending locked");
    }

    function test_Inputs_ZeroAllowedOnRefund() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        uint256 a0 = bal(alice);
        vm.expectEmit(true, true, false, true, address(hisaab));
        emit Hisaab.CopyInputs(CALL1, 0, bytes32(0));
        _settle(CALL1, REFUND, 0, _one(true, 0, 0, bytes32(0)));
        assertEq(bal(alice) - a0, 7e6, "both fees back");
    }

    function test_Inputs_ZeroInLaterCopyRevertsAtItsIndex() public {
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        _pay(CALL1, bob, 1000e6);
        Hisaab.Result[] memory rs = new Hisaab.Result[](2);
        rs[0] = Hisaab.Result(true, 6e6, 0, keccak256("ok"));
        rs[1] = Hisaab.Result(true, 6e6, 0, bytes32(0));
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Hisaab.InvalidResult.selector, CALL1, 1));
        hisaab.settleBatch(CALL1, RIGHT, 0, rs);
    }

    function test_Inputs_WrongCommitsAlongsideCredit() public {
        _buildFund();
        bytes32 id = _newId();
        _reg(id);
        _pay(id, alice, 1000e6);
        bytes32 h = keccak256("alice: entry 2800, stop 2700, fill 2810, w 0.911, ask 9.76");
        vm.expectEmit(true, true, false, true, address(hisaab));
        emit Hisaab.CopyInputs(id, 0, h);
        _settle(id, WRONG, 9_760_000, _one(true, 0, 9_760_000, h));
        assertGt(hisaab.creditBalance(alice), 0, "credit issued");
    }

    function testFuzz_Inputs_EmittedValueMatchesPosted(bytes32 h) public {
        vm.assume(h != bytes32(0));
        _reg(CALL1);
        _pay(CALL1, alice, 1000e6);
        vm.expectEmit(true, true, false, true, address(hisaab));
        emit Hisaab.CopyInputs(CALL1, 0, h);
        _settle(CALL1, RIGHT, 0, _one(false, 0, 0, h));
    }
}

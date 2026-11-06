// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Hisaab} from "../../src/Hisaab.sol";
import {IPermit2} from "../../src/interfaces/IPermit2.sol";
import {MockUSDC} from "./MockUSDC.sol";
import {HisaabHarness} from "./HisaabHarness.sol";
import {Permit2Deployer} from "./Permit2Deployer.sol";

/// @dev Shared fixture. No test functions here: every category file inherits it.
abstract contract HisaabBase is Test {
    bytes32 internal constant PERMIT_TYPEHASH = keccak256(
        "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,CallFee witness)CallFee(bytes32 call,uint256 size)TokenPermissions(address token,uint256 amount)"
    );
    bytes32 internal constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    bytes32 internal constant CALL_FEE_TYPEHASH = keccak256("CallFee(bytes32 call,uint256 size)");

    bytes32 internal constant CALLER = keccak256("raj");
    bytes32 internal constant CALL1 = keccak256("call1");
    bytes32 internal constant CALL2 = keccak256("call2");

    MockUSDC internal usdc;
    address internal permit2;
    HisaabHarness internal hisaab;

    address internal owner = makeAddr("owner");
    address internal writer = makeAddr("writer");
    address internal settler = makeAddr("settler");
    address internal treasury = makeAddr("treasury");
    address internal wallet = makeAddr("wallet");
    address internal wallet2 = makeAddr("wallet2");
    address internal stranger = makeAddr("stranger");

    address internal alice;
    address internal bob;
    address internal carol;
    address internal priya;
    address internal seeder;
    mapping(address => uint256) internal pkOf;

    uint256 internal idCounter;
    uint256 internal nextNonce;

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        usdc = new MockUSDC();
        permit2 = Permit2Deployer.deploy();
        hisaab = new HisaabHarness(address(usdc), permit2, owner, writer, settler, treasury);
        alice = _follower("alice");
        bob = _follower("bob");
        carol = _follower("carol");
        priya = _follower("priya");
        seeder = _follower("seeder");
    }

    function _follower(string memory label) internal returns (address f) {
        uint256 pk;
        (f, pk) = makeAddrAndKey(label);
        pkOf[f] = pk;
        usdc.mint(f, 1e15);
        vm.prank(f);
        usdc.approve(permit2, type(uint256).max);
    }

    // ---------------------------------------------------------------- fees
    function _callFee(uint256 size) internal pure returns (uint256) {
        return (size * 60) / 10_000;
    }

    function _platformFee(uint256 size) internal pure returns (uint256) {
        return (size * 10) / 10_000;
    }

    function _fees(uint256 size) internal pure returns (uint256) {
        return _callFee(size) + _platformFee(size);
    }

    function bal(address a) internal view returns (uint256) {
        return usdc.balanceOf(a);
    }

    // ---------------------------------------------------------------- registration
    function _newId() internal returns (bytes32) {
        return keccak256(abi.encode("id", ++idCounter));
    }

    function _regFull(bytes32 id, bytes32 caller, address w, uint16 share, uint64 dl) internal {
        vm.prank(writer);
        hisaab.registerCall(id, keccak256(abi.encode("fp", id)), caller, w, share, dl);
    }

    function _reg(bytes32 id) internal {
        _regFull(id, CALLER, wallet, 5000, uint64(block.timestamp + 30 days));
    }

    function _regShare(bytes32 id, uint16 share) internal {
        _regFull(id, CALLER, wallet, share, uint64(block.timestamp + 30 days));
    }

    function _deadlineOf(bytes32 id) internal view returns (uint256) {
        return hisaab.getCall(id).deadline;
    }

    // ---------------------------------------------------------------- permit signing
    function _digest(bytes32 id, uint256 size, uint256 amount, uint256 nonce, uint256 dl)
        internal
        view
        returns (bytes32)
    {
        bytes32 witness = keccak256(abi.encode(CALL_FEE_TYPEHASH, id, size));
        bytes32 tp = keccak256(abi.encode(TOKEN_PERMISSIONS_TYPEHASH, address(usdc), amount));
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, tp, address(hisaab), nonce, dl, witness));
        return keccak256(abi.encodePacked("\x19\x01", IPermit2(permit2).DOMAIN_SEPARATOR(), structHash));
    }

    function _sig(uint256 pk, bytes32 id, uint256 size, uint256 amount, uint256 nonce, uint256 dl)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(id, size, amount, nonce, dl));
        return abi.encodePacked(r, s, v);
    }

    /// @dev Follower signs the right permit; the test contract submits.
    function _pay(bytes32 id, address f, uint256 size) internal returns (uint256) {
        uint256 nonce = nextNonce++;
        uint256 dl = block.timestamp + 1 hours;
        return hisaab.payFee(id, f, size, nonce, dl, _sig(pkOf[f], id, size, _fees(size), nonce, dl));
    }

    function _payMany(bytes32 id, address f, uint256 size, uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            _pay(id, f, size);
        }
    }

    // ---------------------------------------------------------------- settlement helpers
    function _res(bool filled, uint256 kept, uint256 ask) internal pure returns (Hisaab.Result memory) {
        return Hisaab.Result(filled, kept, ask, _inputs(filled, kept, ask));
    }

    /// @dev Any non-zero commitment; the contract only stores and emits it.
    function _inputs(bool filled, uint256 kept, uint256 ask) internal pure returns (bytes32) {
        return keccak256(abi.encode("inputs", filled, kept, ask));
    }

    function _arr1(bool filled, uint256 kept, uint256 ask) internal pure returns (Hisaab.Result[] memory rs) {
        rs = new Hisaab.Result[](1);
        rs[0] = _res(filled, kept, ask);
    }

    function _uniform(uint256 n, bool filled, uint256 kept, uint256 ask)
        internal
        pure
        returns (Hisaab.Result[] memory rs)
    {
        rs = new Hisaab.Result[](n);
        for (uint256 i; i < n; ++i) {
            rs[i] = _res(filled, kept, ask);
        }
    }

    function _settle(bytes32 id, Hisaab.Ending e, uint256 totalAsk, Hisaab.Result[] memory rs) internal {
        vm.prank(settler);
        hisaab.settleBatch(id, e, totalAsk, rs);
    }

    function _expire(bytes32 id, uint256 count) internal {
        vm.warp(_deadlineOf(id) + 7 days);
        hisaab.continueAsRefund(id, count);
    }

    // ---------------------------------------------------------------- credit and fund builders
    /// @dev Give `f` exactly `amount` of credit via a Right call (builds a fund) and a Wrong call (issues credit).
    /// `amount` should be at least 1000 units so the seed copy is not below the minimum size.
    function _giveCredit(address f, uint256 amount) internal {
        bytes32 sc = keccak256(abi.encode("seedcaller", ++idCounter));
        bytes32 rc = _newId();
        _regFull(rc, sc, wallet2, 1000, uint64(block.timestamp + 30 days));
        uint256 big = amount * 1000 < 1e6 ? 1e6 : amount * 1000;
        _pay(rc, seeder, big);
        _settle(rc, Hisaab.Ending.Right, 0, _arr1(true, _callFee(big), 0));
        bytes32 wc = _newId();
        _regFull(wc, sc, wallet2, 1000, uint64(block.timestamp + 30 days));
        _pay(wc, f, amount * 4 < 1e6 ? 1e6 : amount * 4);
        _settle(wc, Hisaab.Ending.Wrong, amount, _arr1(true, 0, amount));
    }

    /// @dev Leaves CALLER's fund at earned 70e6 and credit-only 30e6 (total $100). priya ends with 10e6 credit.
    function _buildFund() internal {
        bytes32 a = _newId();
        _reg(a);
        _pay(a, bob, 40_000e6);
        _settle(a, Hisaab.Ending.Right, 0, _arr1(true, 220e6, 0)); // earned +110
        bytes32 b = _newId();
        _reg(b);
        _pay(b, priya, 1000e6);
        _settle(b, Hisaab.Ending.Wrong, 40e6, _arr1(true, 0, 40e6)); // credit 40 from earned
        bytes32 d = _newId();
        _reg(d);
        _pay(d, priya, 5000e6); // $30 call fee fully credit-paid
        _settle(d, Hisaab.Ending.Right, 0, _arr1(true, 30e6, 0)); // creditOnly +30
        assertEq(hisaab.earnedFund(CALLER), 70e6);
        assertEq(hisaab.creditOnlyFund(CALLER), 30e6);
    }
}

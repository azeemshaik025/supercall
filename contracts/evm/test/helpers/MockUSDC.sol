// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test helper. Plain 6-decimal ERC-20 with a per-address recipient blocklist on `transfer`.
/// In soft-fail mode a blocked transfer returns false instead of reverting.
contract MockUSDC is ERC20 {
    error Blocked(address to);

    mapping(address => bool) public blocked;
    bool public softFail;

    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address account, bool isBlocked) external {
        blocked[account] = isBlocked;
    }

    function setSoftFail(bool soft) external {
        softFail = soft;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (blocked[to]) {
            if (softFail) return false;
            revert Blocked(to);
        }
        return super.transfer(to, value);
    }
}

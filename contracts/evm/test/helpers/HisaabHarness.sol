// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Hisaab} from "../../src/Hisaab.sol";

/// @dev Test harness that makes the stubbed earned-fund limit overridable.
contract HisaabHarness is Hisaab {
    uint256 public limitOverride = type(uint256).max;

    constructor(address usdc_, address permit2_, address owner_, address writer_, address settler_, address treasury_)
        Hisaab(usdc_, permit2_, owner_, writer_, settler_, treasury_)
    {}

    function setLimit(uint256 limit) external {
        limitOverride = limit;
    }

    function fundLimit(bytes32) public view override returns (uint256) {
        return limitOverride;
    }
}

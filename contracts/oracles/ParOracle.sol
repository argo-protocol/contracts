// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IOracle } from "../interfaces/IOracle.sol";

/**
 * @notice price oracle for stablecoins traded at $1
 */
contract MainnetChainlinkOracle is IOracle {
    /**
     * @notice fetches the latest price
     * @return the price with 18 decimals
     */
    function fetchPrice() external view override returns (bool, uint256) {
        return (true, 1e18);
    }
}


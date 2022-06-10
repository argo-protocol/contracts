// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IOracle {
    /**
     * @notice Fetch price of the collateral token in terms of the debt token.
     * @dev Should have the same return precision as the debt token.
     * @return Successful fetch and the value of 1 collateral token in terms of the debt token.
     */
    function fetchPrice() external view returns (bool, uint);
}

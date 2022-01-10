//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { IOracle } from "../interfaces/IOracle.sol";
import { AggregatorV3Interface } from "../interfaces/AggregatorV3Interface.sol";
import { SafeAggregatorV3 } from "../libraries/SafeAggregatorV3.sol";

/**
 * @notice stubby price oracle for gOHM-USD on testnets
 */
contract StubgOHMOracle is IOracle {
    using SafeAggregatorV3 for AggregatorV3Interface;

    function fetchPrice() external pure override returns (bool, uint256) {
        return (true, 10);
    }
}

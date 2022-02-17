// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IOracle } from "../interfaces/IOracle.sol";
import { AggregatorV3Interface } from "../interfaces/AggregatorV3Interface.sol";
import { SafeAggregatorV3 } from "../libraries/SafeAggregatorV3.sol";
import { UniswapPairOracle } from "./UniswapPairOracle.sol";

/**
 * @notice price oracle for chainlink denominated in USD, ethereum mainnet
 */
contract MainnetChainlinkOracle is IOracle {
    using SafeAggregatorV3 for AggregatorV3Interface;

    AggregatorV3Interface private chainlinkUsdFeed;

    constructor(        
        address _chainlinkUsdFeed
    ) {
        require(_chainlinkUsdFeed != address(0), "Oracle: 0x0 _chainlinkUsdFeed address");

        chainlinkUsdFeed = AggregatorV3Interface(_chainlinkUsdFeed);        
    }

    /**
     * @notice fetches the latest price     
     * @return the price with 18 decimals
     */
    function fetchPrice() external view override returns (bool, uint256) {
        (bool success, uint256 price) = chainlinkUsdFeed.safeLatestRoundData();

        if (!success) {
            return (false, 0);
        }
                     
        return (true, price);
    }
}

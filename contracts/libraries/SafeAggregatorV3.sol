// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { AggregatorV3Interface } from "../interfaces/AggregatorV3Interface.sol";

library SafeAggregatorV3 {
    uint private constant TARGET_DECIMALS = 18;

    /**
     * @notice returns  the latest price from a chainlink feed
     * @return boolean if call was successful
     * @return the price with 18 decimals
     */
    function safeLatestRoundData(AggregatorV3Interface self) internal view returns (bool, uint) {
        uint8 decimals;

        try self.decimals() returns (uint8 decimals_) {
            decimals = decimals_;
        } catch {
            return (false, 0);
        }

        try self.latestRoundData() returns (
            uint80, /* currentRoundId */
            int256 currentPrice,
            uint256, /* startedAt */
            uint256, /* timestamp */
            uint80 /* answeredInRound */
        ) {
            uint price = uint(currentPrice);
            if (decimals < TARGET_DECIMALS) {
                price = price * (10**(TARGET_DECIMALS - decimals));
            } else if (decimals > TARGET_DECIMALS) {
                price = price / (10**(decimals - TARGET_DECIMALS));
            }
            return (true, price);
        } catch {
            return (false, 0);
        }
    }
}

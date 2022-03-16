// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IOracle } from "../interfaces/IOracle.sol";
import { IgOHM } from "../interfaces/IgOHM.sol";
import { AggregatorV3Interface } from "../interfaces/AggregatorV3Interface.sol";
import { SafeAggregatorV3 } from "../libraries/SafeAggregatorV3.sol";

/**
 * @notice price oracle for gOHM-USD on the ethereum mainnet
 */
contract MainnetgOHMOracle is IOracle {
    using SafeAggregatorV3 for AggregatorV3Interface;

    uint256 private constant GOHM_PRECISION = 1e9;
    IgOHM private immutable gOHM;
    AggregatorV3Interface private immutable ohmEthFeed;
    AggregatorV3Interface private immutable ethUsdFeed;

    constructor(
        address _gohm,
        address _ohmEthFeed,
        address _ethUsdFeed
    ) {
        require(_gohm != address(0), "Oracle: 0x0 gOHM address");
        require(_ohmEthFeed != address(0), "Oracle: 0x0 OHM-ETH address");
        require(_ethUsdFeed != address(0), "Oracle: 0x0 ETH-USD address");

        gOHM = IgOHM(_gohm);
        ohmEthFeed = AggregatorV3Interface(_ohmEthFeed);
        ethUsdFeed = AggregatorV3Interface(_ethUsdFeed);
    }

    /**
     * @notice fetches the latest price
     * @return the price with 18 decimals
     */
    function fetchPrice() external view override returns (bool, uint) {
        (bool ethUsdSuccess, uint ethUsdPrice) = ethUsdFeed.safeLatestRoundData();
        (bool ohmEthSuccess, uint ohmEthPrice) = ohmEthFeed.safeLatestRoundData();

        if (!ethUsdSuccess || !ohmEthSuccess) {
            return (false, 0);
        }

         return (true, ((ohmEthPrice * ethUsdPrice / 1e18) * gOHM.index() / GOHM_PRECISION));
    }
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IOracle } from "../interfaces/IOracle.sol";
import { AggregatorV3Interface } from "../interfaces/AggregatorV3Interface.sol";
import { SafeAggregatorV3 } from "../libraries/SafeAggregatorV3.sol";

/**
    See https://github.com/lidofinance/lido-dao/blob/master/contracts/0.6.12/WstETH.sol
 */
interface IwstETH {
    /**
     * @notice Get amount of wstETH for a given amount of stETH
     * @param _stETHAmount amount of stETH
     * @return Amount of wstETH for a given stETH amount
     */
    function getWstETHByStETH(uint256 _stETHAmount) external view returns (uint256);

    /**
     * @notice Get amount of stETH for a given amount of wstETH
     * @param _wstETHAmount amount of wstETH
     * @return Amount of stETH for a given wstETH amount
     */
    function getStETHByWstETH(uint256 _wstETHAmount) external view returns (uint256);
}

/**
 * @notice price oracle for wxBTRFLY-USD on the ethereum mainnet
 * @dev see https://github.com/argo-protocol/contracts/issues/19
 */
contract MainnetwstETH is IOracle {
    using SafeAggregatorV3 for AggregatorV3Interface;

    IwstETH private immutable wstETH;        
    AggregatorV3Interface private immutable stEthUSDFeed;

    constructor(
        address _wstETH,
        address _stEthUSDFeed
    ) {
        require(_wstETH != address(0), "Oracle: 0x0 wstETH address");
        require(_stEthUSDFeed != address(0), "Oracle: 0x0 chainlink address");
        
        wstETH = IwstETH(_wstETH);
        stEthUSDFeed = AggregatorV3Interface(_stEthUSDFeed);        
    }

    /**
     * @notice fetches the latest price
     * @dev wxBTRFLY/USD = IwxBTRFLY::wBTRFLYValue(BTRFLY/OHM * OHM/ETH * ETH/USD)
     * @return the price with 18 decimals
     */
    function fetchPrice() external view override returns (bool, uint256) {
        (bool success, uint256 price) = stEthUSDFeed.safeLatestRoundData();

        if (!success) {
            return (false, 0);
        }
                     
        return (true, wstETH.getWstETHByStETH(price));
    }
}

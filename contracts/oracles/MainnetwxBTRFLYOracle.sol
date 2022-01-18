// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IOracle } from "../interfaces/IOracle.sol";
import { AggregatorV3Interface } from "../interfaces/AggregatorV3Interface.sol";
import { SafeAggregatorV3 } from "../libraries/SafeAggregatorV3.sol";
import { UniswapPairOracle } from "./UniswapPairOracle.sol";

interface IwxBTRFLY {
      /**
        @notice converts wBTRFLY amount to sBTRFLY
        @dev see https://github.com/redacted-cartel/REDACTED-Smart-Contracts/blob/058416542dbb2a2a532a54328ce2df0f10a34bb0/contracts/WXBTRFLY.sol#L912
        @param _amount uint
        @return uint
     */
    function xBTRFLYValue( uint _amount ) external view returns ( uint );

     /**
        @notice converts sBTRFLY amount to wBTRFLY
        @dev see https://github.com/redacted-cartel/REDACTED-Smart-Contracts/blob/058416542dbb2a2a532a54328ce2df0f10a34bb0/contracts/WXBTRFLY.sol#L921
        @param _amount uint
        @return uint
     */
    function wBTRFLYValue( uint _amount ) external view returns ( uint );
}

/**
 * @notice price oracle for wxBTRFLY-USD on the ethereum mainnet
 * @dev see https://github.com/argo-protocol/contracts/issues/19
 */
contract MainnetwxBTRFLYOracle is IOracle {
    using SafeAggregatorV3 for AggregatorV3Interface;

    IwxBTRFLY private wxBTRFLY;
    UniswapPairOracle private btrflyOhmFeed;
    AggregatorV3Interface private ohmEthFeed;
    AggregatorV3Interface private ethUsdFeed;

    constructor(
        address _wxBTRFLY,
        address _btrflyOhmFeed,
        address _ohmEthFeed,
        address _ethUsdFeed
    ) {
        require(_wxBTRFLY != address(0), "Oracle: 0x0 wxBTRFLY address");
        require(_btrflyOhmFeed != address(0), "Oracle: 0x0 btrflyOhmFeed address");
        require(_ohmEthFeed != address(0), "Oracle: 0x0 OHM-ETH address");
        require(_ethUsdFeed != address(0), "Oracle: 0x0 ETH-USD address");

        wxBTRFLY = IwxBTRFLY(_wxBTRFLY);

        ohmEthFeed = AggregatorV3Interface(_ohmEthFeed);
        ethUsdFeed = AggregatorV3Interface(_ethUsdFeed);
    }

    /**    
     * @notice fetches the latest price
     * @dev wxBTRFLY/USD = IwxBTRFLY::wBTRFLYValue(BTRFLY/OHM * OHM/ETH * ETH/USD)
     * @return the price with 18 decimals
     */
    function fetchPrice() external view override returns (bool, uint) {
        (bool ethUsdSuccess, uint ethUsdPrice) = ethUsdFeed.safeLatestRoundData();
        (bool ohmEthSuccess, uint ohmEthPrice) = ohmEthFeed.safeLatestRoundData();
        uint btrflyOhmPrice;

        if (!ethUsdSuccess || !ohmEthSuccess) {
            return (false, 0);
        }

         return (true, wxBTRFLY.wBTRFLYValue(btrflyOhmPrice * ohmEthPrice * ethUsdPrice));
    }
}
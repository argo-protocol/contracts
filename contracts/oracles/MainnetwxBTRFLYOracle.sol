// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IOracle } from "../interfaces/IOracle.sol";
import { AggregatorV3Interface } from "../interfaces/AggregatorV3Interface.sol";
import { SafeAggregatorV3 } from "../libraries/SafeAggregatorV3.sol";
import { UniswapPairOracle } from "./UniswapPairOracle.sol";
import "hardhat/console.sol";

interface IwxBTRFLY {
    /**
        @notice converts wBTRFLY amount to sBTRFLY
        @dev see https://github.com/redacted-cartel/REDACTED-Smart-Contracts/blob/058416542dbb2a2a532a54328ce2df0f10a34bb0/contracts/WXBTRFLY.sol#L912
        @param _amount uint
        @return uint
     */
    function xBTRFLYValue(uint256 _amount) external view returns (uint256);

    /**
        @notice converts sBTRFLY amount to wBTRFLY
        @dev see https://github.com/redacted-cartel/REDACTED-Smart-Contracts/blob/058416542dbb2a2a532a54328ce2df0f10a34bb0/contracts/WXBTRFLY.sol#L921
        @param _amount uint
        @return uint
     */
    function wBTRFLYValue(uint256 _amount) external view returns (uint256);
}

/**
 * @notice price oracle for wxBTRFLY-USD on the ethereum mainnet
 * @dev see https://github.com/argo-protocol/contracts/issues/19
 */
contract MainnetwxBTRFLYOracle is IOracle {
    using SafeAggregatorV3 for AggregatorV3Interface;

    IwxBTRFLY private wxBTRFLY;
    address private btrfly;
    UniswapPairOracle private uniswapPairOracle;
    AggregatorV3Interface private ohmEthFeed;
    AggregatorV3Interface private ethUsdFeed;

    constructor(
        address _wxBTRFLY,
        address _btrfly,
        address _uniswapPairOracle, // sushiswap oracle
        address _ohmEthFeed,
        address _ethUsdFeed
    ) {
        require(_wxBTRFLY != address(0), "Oracle: 0x0 wxBTRFLY address");
        require(_btrfly != address(0), "Oracle: 0x0 BTRFLY address");
        require(_uniswapPairOracle != address(0), "Oracle: 0x0 pairOracle address");
        require(_ohmEthFeed != address(0), "Oracle: 0x0 OHM-ETH address");
        require(_ethUsdFeed != address(0), "Oracle: 0x0 ETH-USD address");

        wxBTRFLY = IwxBTRFLY(_wxBTRFLY);
        btrfly = _btrfly;
        ohmEthFeed = AggregatorV3Interface(_ohmEthFeed);
        ethUsdFeed = AggregatorV3Interface(_ethUsdFeed);
        uniswapPairOracle = UniswapPairOracle(_uniswapPairOracle);
    }

    function update() external {
        if (uniswapPairOracle.canUpdate()) {
            uniswapPairOracle.update();
        }
    }

    /**
     * @notice fetches the latest price
     * @dev wxBTRFLY/USD = IwxBTRFLY::wBTRFLYValue(BTRFLY/OHM * OHM/ETH * ETH/USD)
     * @return the price with 18 decimals
     */
    function fetchPrice() external view override returns (bool, uint256) {
        (bool ethUsdSuccess, uint256 ethUsdPrice) = ethUsdFeed.safeLatestRoundData();
        (bool ohmEthSuccess, uint256 ohmEthPrice) = ohmEthFeed.safeLatestRoundData();

        uint256 btrflyOhmPrice = uniswapPairOracle.consult(btrfly, 1e9);

        if (!ethUsdSuccess || !ohmEthSuccess) {
            return (false, 0);
        }

        uint256 btrflyUsdPrice = (btrflyOhmPrice * ohmEthPrice * ethUsdPrice); //1e18 for ohmEthPrice, 1e18 for ethUsdPrice, 1e9 for btrflyOhm

        console.log("ethUsdPrice", ethUsdPrice);
        console.log("ohmEthPrice", ohmEthPrice);
        console.log("btrflyOhmPrice", btrflyOhmPrice);
        console.log("btrflyUsdPrice", btrflyUsdPrice);

        uint256 wxFactor = wxBTRFLY.wBTRFLYValue(1e9);
        console.log("wxFactor", wxFactor);
        uint256 result = btrflyUsdPrice / wxFactor / 1e9;
        console.log("result", result);

        return (true, result);
    }
}
